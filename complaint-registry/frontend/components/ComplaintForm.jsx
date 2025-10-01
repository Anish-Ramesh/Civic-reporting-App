import { useState } from 'react';
import { ethers } from 'ethers';
import { uploadToIPFS, storeComplaintMetadata, generateCanonicalString } from '../../utils/ipfs';

const ComplaintForm = ({ contract, account }) => {
  const [formData, setFormData] = useState({
    reason: '',
    description: '',
    locationName: '',
    lat: '',
    lng: '',
    media: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
          // You might want to reverse geocode to get location name
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
      // 1. Upload media to IPFS
      let mediaCid = '';
      if (formData.media) {
        mediaCid = await uploadToIPFS(formData.media);
      }

      // 2. Prepare and store metadata
      const metadata = {
        id: Date.now(), // In a real app, use a proper ID generation
        reporter: account,
        reason: formData.reason,
        description: formData.description,
        location: {
          name: formData.locationName,
          lat: formData.lat,
          lng: formData.lng
        },
        timestamp: new Date().toISOString(),
        mediaCid
      };

      // 3. Store metadata on IPFS
      const metadataCid = await storeComplaintMetadata(metadata);

      // 4. Generate canonical string and hash
      const canonicalString = generateCanonicalString({
        ...metadata,
        ipfsCid: metadataCid,
        locationName: formData.locationName,
        lat: formData.lat,
        lng: formData.lng
      });
      
      const dataHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(canonicalString));

      // 5. Call smart contract
      const tx = await contract.registerComplaint(
        metadata.id,
        metadataCid,
        dataHash,
        formData.reason,
        formData.description,
        formData.locationName,
        Math.round(formData.lat * 1e6), // Convert to microdegrees for Solidity
        Math.round(formData.lng * 1e6)  // Convert to microdegrees for Solidity
      );

      await tx.wait();
      
      setSuccess('Complaint registered successfully!');
      // Reset form
      setFormData({
        reason: '',
        description: '',
        locationName: '',
        lat: '',
        lng: '',
        media: null
      });
      
    } catch (error) {
      console.error('Error submitting complaint:', error);
      setError(error.message || 'Failed to submit complaint');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">File a Complaint</h2>
      
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
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for Complaint *
          </label>
          <input
            type="text"
            name="reason"
            value={formData.reason}
            onChange={handleInputChange}
            className="w-full p-2 border rounded-md"
            required
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
            Upload Evidence (Image/Video)
          </label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="w-full p-2 border rounded-md"
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-2 px-4 rounded-md text-white font-medium ${
            isLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Submitting...' : 'Submit Complaint'}
        </button>
      </form>
    </div>
  );
};

export default ComplaintForm;
