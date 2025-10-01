// Blockchain utilities to interact with ComplaintRegistry
// Requires: ethers v6, nft.storage

import { BrowserProvider, Contract, parseEther, keccak256, toUtf8Bytes } from 'ethers';
import { NFTStorage, File } from 'nft.storage';
import abiJson from '../contracts/ComplaintRegistry.json';

const CONTRACT_ADDRESS = import.meta.env.VITE_COMPLAINT_REGISTRY_ADDRESS || '';
// Fallback to VITE_IPFS_API_KEY if VITE_NFT_STORAGE_TOKEN not provided
const NFT_STORAGE_TOKEN = import.meta.env.VITE_NFT_STORAGE_TOKEN || import.meta.env.VITE_IPFS_API_KEY || '';

function hasEthereum() {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

export async function connectWallet(requestPermissions = true) {
  if (!hasEthereum()) throw new Error('No crypto wallet detected');
  const provider = new BrowserProvider(window.ethereum);
  if (requestPermissions) {
    await provider.send('eth_requestAccounts', []);
  }
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

export function getContract(signerOrProvider) {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured');
  return new Contract(CONTRACT_ADDRESS, abiJson.abi, signerOrProvider);
}

export async function saveComplaintMetadataToIPFS(payload) {
  if (!NFT_STORAGE_TOKEN) throw new Error('NFT.Storage token not configured');
  const client = new NFTStorage({ token: NFT_STORAGE_TOKEN });
  const json = JSON.stringify(payload, null, 2);
  const file = new File([json], 'complaint.json', { type: 'application/json' });
  const cid = await client.storeBlob(file);
  return cid; // return CID string
}

export function computeComplaintDataHash(ipfsCid, ipfsData, reporterAddressLower) {
  const canonical = `${ipfsData.id}|${reporterAddressLower}|${ipfsData.reason}|${ipfsData.description}|${ipfsData.location?.name || ''}|${ipfsData.location?.lat ?? ''}|${ipfsData.location?.lng ?? ''}|${ipfsCid}|${new Date(ipfsData.timestamp).toISOString()}`;
  return keccak256(toUtf8Bytes(canonical));
}

// Registers a complaint on-chain. Non-throwing helper; returns { txHash, id } on success.
export async function registerComplaintOnChain({
  id,
  reason,
  description,
  location,
  reporterUid,
  mediaUrl,
  audioUrl,
}) {
  try {
    if (!hasEthereum() || !CONTRACT_ADDRESS) {
      console.info('[blockchain] Skipping on-chain registration (no wallet or contract configured)');
      return null;
    }

    // 1) Connect wallet
    const { provider, signer, address } = await connectWallet(false).catch(async () => {
      // fall back to request accounts if not already connected
      return connectWallet(true);
    });

    // 2) Build metadata for IPFS
    const ipfsData = {
      id: Number(id),
      reporter: address,
      reason,
      description,
      location: {
        name: location?.name || '',
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      },
      mediaUrl: mediaUrl || '',
      audioUrl: audioUrl || '',
      timestamp: new Date().toISOString(),
      reporterUid: reporterUid || '',
      dapp: 'MobilEASE',
      version: 1,
    };

    // 3) Save to IPFS
    const ipfsCid = await saveComplaintMetadataToIPFS(ipfsData);

    // 4) Compute canonical hash
    const dataHash = computeComplaintDataHash(ipfsCid, ipfsData, address.toLowerCase());

    // 5) Prepare args
    const latInt = typeof location?.lat === 'number' ? Math.round(location.lat * 1e6) : 0;
    const lngInt = typeof location?.lng === 'number' ? Math.round(location.lng * 1e6) : 0;

    const contract = getContract(signer);
    const tx = await contract.registerComplaint(
      Number(id),
      ipfsCid,
      dataHash,
      String(reason || ''),
      String(description || ''),
      String(location?.name || ''),
      BigInt(latInt),
      BigInt(lngInt)
    );
    const [receipt, network] = await Promise.all([
      tx.wait(),
      provider.getNetwork(),
    ]);
    return { txHash: receipt.hash, id: Number(id), ipfsCid, chainId: Number(network.chainId) };
  } catch (err) {
    console.warn('[blockchain] registerComplaintOnChain failed:', err?.message || err);
    return null; // non-throwing
  }
}

export async function verifyComplaintIntegrity(complaintData) {
  try {
    const { provider } = await connectWallet(false).catch(() => ({}));
    if (!provider) throw new Error('No wallet connected');
    
    const contract = getContract(provider);
    const onChainData = await contract.getComplaint(complaintData.onChain.onChainId);
    
    // Recompute hash from local data
    const computedHash = computeComplaintDataHash({
      id: complaintData.onChain.onChainId,
      reason: complaintData.reason,
      description: complaintData.description,
      location: complaintData.location,
      reporterUid: complaintData.reportedBy,
      mediaUrl: complaintData.mediaUrl || '',
      audioUrl: complaintData.audioUrl || '',
      timestamp: new Date(complaintData.createdAt).getTime() / 1000,
    });
    
    // Fetch IPFS data
    const ipfsUrl = `https://${complaintData.onChain.ipfsCid}.ipfs.nftstorage.link/`;
    const ipfsRes = await fetch(ipfsUrl);
    if (!ipfsRes.ok) throw new Error('IPFS data not found');
    const ipfsData = await ipfsRes.json();
    
    return {
      isVerified: computedHash === onChainData.dataHash,
      onChainData: {
        dataHash: onChainData.dataHash,
        ipfsCid: onChainData.ipfsCid,
        timestamp: new Date(Number(onChainData.timestamp) * 1000).toISOString(),
      },
      computedHash,
      ipfsData,
    };
  } catch (err) {
    console.warn('Verification failed:', err);
    return { isVerified: false, error: err.message };
  }
}
