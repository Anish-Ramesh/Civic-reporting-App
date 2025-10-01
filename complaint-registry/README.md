# Blockchain Complaint Registry for MobilEASE

This module adds blockchain-based complaint registration to the MobilEASE application, providing an immutable record of complaints and their status.

## Features

- Register complaints on the blockchain with IPFS media storage
- Track complaint status (In Progress, Solved, Rejected)
- Add responses and comments to complaints
- Like complaints
- Verify complaint integrity using on-chain hashes
- Support for Sepolia and Optimism Sepolia testnets

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- MetaMask browser extension
- [nft.storage](https://nft.storage/) account (free)
- Test ETH on Sepolia and Optimism Sepolia (get from faucets)

## Setup

1. **Install Dependencies**
   ```bash
   cd complaint-registry
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file in the root directory with:
   ```
   # Wallet
   PRIVATE_KEY=your_private_key_here
   
   # RPC URLs
   SEPOLIA_RPC_URL=your_sepolia_rpc_url
   OPTIMISM_SEPOLIA_RPC_URL=https://sepolia.optimism.io
   
   # API Keys
   ETHERSCAN_API_KEY=your_etherscan_api_key
   OPTIMISTIC_ETHERSCAN_API_KEY=your_optimistic_etherscan_api_key
   
   # NFT.Storage
   NEXT_PUBLIC_NFT_STORAGE_TOKEN=your_nft_storage_api_token
   ```

3. **Compile Contracts**
   ```bash
   npx hardhat compile
   ```

## Deployment

### Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### Deploy to Optimism Sepolia
```bash
npx hardhat run scripts/deploy.js --network optimismSepolia
```

## Frontend Integration

1. **Install Required Dependencies**
   ```bash
   cd frontend
   npm install ethers @metamask/providers nft.storage
   ```

2. **Import and Use Components**
   ```jsx
   import ComplaintForm from './components/ComplaintForm';
   
   // In your component
   <ComplaintForm 
     contract={complaintRegistryContract} 
     account={currentAccount} 
   />
   ```

## Smart Contract Verification

To verify your contract on Etherscan:

```bash
npx hardhat verify --network sepolia DEPLOYED_CONTRACT_ADDRESS
```

## Testing

Run tests with:
```bash
npx hardhat test
```

## Usage Flow

1. User submits a complaint with details and optional media
2. Media is uploaded to IPFS via nft.storage
3. Metadata is stored on IPFS
4. A canonical hash is generated and stored on-chain
5. Complaint is registered on the blockchain
6. Officials can update status, add responses, and comments
7. Users can verify complaint integrity by comparing on-chain hashes with recomputed hashes from IPFS data

## Security Considerations

- Never commit your private keys to version control
- Use environment variables for sensitive information
- Always verify contract code on block explorers
- Test thoroughly on testnets before deploying to mainnet

## License

MIT
