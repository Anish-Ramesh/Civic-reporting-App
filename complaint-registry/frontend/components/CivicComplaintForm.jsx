import { useState } from 'react';
import { ethers } from 'ethers';
import { uploadToIPFS, storeComplaintMetadata } from '../../utils/ipfs';

const CivicComplaintForm = ({ contract, account }) => {
  const [formData, setFormData] = useState({
    complaintId: '',
    description: '',
    locationName: '',
    lat: '',
    lng: '',
    media: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [blockInfo, setBlockInfo] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({
        ...prev,
        media: e.target.files[0]
      }));
    }
  };

  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }));
        },
        (error) => {
          console.error('Error getting location:', error);
          setError('Failed to get your location. Please enter it manually.');
        }
      );
    } else {
      setError('Geolocation is not supported by your browser');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      // Validate complaint ID
      if (!formData.complaintId) {
        throw new Error('Complaint ID is required');
      }

      // 1. Upload media to IPFS
      let mediaHash = '';
      if (formData.media) {
        mediaHash = await uploadToIPFS(formData.media);
      }

      // 2. Prepare complaint metadata
      const complaintData = {
        complaintId: formData.complaintId,
        reporter: account,
        description: formData.description,
        location: {
          name: formData.locationName,
          lat: formData.lat,
          lng: formData.lng
        },
        mediaHash,
        timestamp: new Date().toISOString()
      };

      // 3. Store metadata on IPFS
      const metadataCid = await storeComplaintMetadata(complaintData);

      // 4. File complaint on blockchain (creates new block)
      const tx = await contract.fileComplaint(
        formData.complaintId,
        formData.description,
        formData.locationName,
        Math.round(formData.lat * 1e6), // Convert to microdegrees
        Math.round(formData.lng * 1e6), // Convert to microdegrees
        metadataCid // Use IPFS CID as media hash
      );

      const receipt = await tx.wait();
      
      // Extract block information from transaction receipt
      const blockNumber = receipt.blockNumber;
      const blockInfo = {
        blockNumber: blockNumber,
        transactionHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString()
      };
      
      setBlockInfo(blockInfo);
      setSuccess(`Complaint filed successfully! Block #${blockNumber} created.`);
      
      // Reset form
      setFormData({
        complaintId: '',
        description: '',
        locationName: '',
        lat: '',
        lng: '',
        media: null
      });
      
    } catch (error) {
      console.error('Error filing complaint:', error);
      setError(error.message || 'Failed to file complaint');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">File a Civic Complaint</h2>
      <p className="text-sm text-gray-600 mb-4">
        Each complaint creates a new immutable block on the blockchain
      </p>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
          {success}
        </div>
      )}

      {blockInfo && (
        <div className="mb-4 p-3 bg-blue-100 text-blue-700 rounded">
          <h4 className="font-bold mb-2">Block Information:</h4>
          <p><strong>Block Number:</strong> {blockInfo.blockNumber}</p>
          <p><strong>Transaction Hash:</strong> {blockInfo.transactionHash}</p>
          <p><strong>Gas Used:</strong> {blockInfo.gasUsed}</p>
          <p><strong>Effective Gas Price:</strong> {blockInfo.effectiveGasPrice}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Complaint ID *
          </label>
          <input
            type="number"
            name="complaintId"
            value={formData.complaintId}
            onChange={handleInputChange}
            className="w-full p-2 border rounded-md"
            required
            placeholder="Enter unique complaint ID"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description *
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={4}
            className="w-full p-2 border rounded-md"
            required
            placeholder="Describe the civic issue (pothole, garbage, etc.)"
          />
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Location
            </label>
            <button
              type="button"
              onClick={handleDetectLocation}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Detect My Location
            </button>
          </div>
          <input
            type="text"
            name="locationName"
            value={formData.locationName}
            onChange={handleInputChange}
            placeholder="Enter location name/address"
            className="w-full p-2 border rounded-md mb-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              name="lat"
              value={formData.lat}
              onChange={handleInputChange}
              placeholder="Latitude"
              step="any"
              className="w-full p-2 border rounded-md"
            />
            <input
              type="number"
              name="lng"
              value={formData.lng}
              onChange={handleInputChange}
              placeholder="Longitude"
              step="any"
              className="w-full p-2 border rounded-md"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Media Evidence (Photo/Video)
          </label>
          <input
            type="file"
            name="media"
            onChange={handleFileChange}
            accept="image/*,video/*"
            className="w-full p-2 border rounded-md"
          />
          <p className="text-xs text-gray-500 mt-1">
            Media will be stored on IPFS and only the hash will be recorded on-chain
          </p>
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isLoading ? 'Creating Block...' : 'File Complaint (Create Block)'}
        </button>
      </form>
    </div>
  );
};

export default CivicComplaintForm;
