import mongoose from 'mongoose';

const EmailSearchResultSchema = new mongoose.Schema({
    npi: { type: String, required: true, unique: true },
    email: { type: String },
    status: { type: String, enum: ['PENDING', 'FOUND', 'FAILED'], default: 'PENDING' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('EmailSearchResult', EmailSearchResultSchema);