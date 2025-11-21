import { NFTStorage, File } from 'nft.storage';

const NFT_STORAGE_TOKEN = process.env.NEXT_PUBLIC_NFT_STORAGE_TOKEN || '';

if (!NFT_STORAGE_TOKEN) {
  console.warn('NFT.Storage token not found. Please set NEXT_PUBLIC_NFT_STORAGE_TOKEN in your environment variables.');
}

const client = new NFTStorage({ token: NFT_STORAGE_TOKEN });

/**
 * Uploads a file to IPFS via NFT.Storage
 * @param {File} file - The file to upload
 * @returns {Promise<string>} - The IPFS CID of the uploaded file
 */
export async function uploadToIPFS(file) {
  try {
    console.log('Uploading file to IPFS...');
    const cid = await client.storeBlob(new File([file], file.name, { type: file.type }));
    return cid;
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    throw new Error('Failed to upload file to IPFS');
  }
}

/**
 * Stores complaint metadata on IPFS
 * @param {Object} metadata - The complaint metadata
 * @returns {Promise<string>} - The IPFS CID of the stored metadata
 */
export async function storeComplaintMetadata(metadata) {
  try {
    console.log('Storing complaint metadata on IPFS...');
    const metadataFile = new File(
      [JSON.stringify(metadata, null, 2)],
      'metadata.json',
      { type: 'application/json' }
    );
    const cid = await client.storeBlob(metadataFile);
    return cid;
  } catch (error) {
    console.error('Error storing metadata on IPFS:', error);
    throw new Error('Failed to store metadata on IPFS');
  }
}

/**
 * Generates a canonical string for hashing
 * @param {Object} complaintData - The complaint data
 * @returns {string} - The canonical string
 */
export function generateCanonicalString(complaintData) {
  const { id, reporter, reason, description, locationName, lat, lng, ipfsCid, timestamp } = complaintData;
  return `${id}|${reporter.toLowerCase()}|${reason}|${description}|${locationName}|${lat}|${lng}|${ipfsCid}|${timestamp}`;
}
