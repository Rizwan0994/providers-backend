// import express from 'express';
// import fetch from 'node-fetch'; // if using ESM, or `const fetch = require('node-fetch')` in CJS
// import cors from 'cors';
// const app = express();
// const PORT = 8000;

// // Enable CORS
// app.use(cors());
// app.use(express.json());

// app.get('/api/providers', async (req, res) => {
//   try {
//     const params = new URLSearchParams({
//       version: '2.1',
//       limit: 20,
//       skip: 0,
//       ...req.query
//     });

//     const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
//     const data = await response.json();

//     res.json(data);
//   } catch (err) {
//     console.error('Error fetching providers:', err);
//     res.status(500).json({ error: 'Failed to fetch providers' });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}`);
// });

// backend/server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

import EmailSearchResult from './models/EmailSearchResult.js';
const app = express();
const PORT = 8000;
const ICYPEAS_API_KEY = process.env.ICYPEAS_API_KEY || '73f7ae24064744d999dd35c6e65de95bc8bd83944593449fad84e4cf378a80b9'; // Replace with your actual API key
const ICYPEAS_BASE_URL = 'https://app.icypeas.com/api';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin@cluster0.3lrinwh.mongodb.net/provider_db?retryWrites=true&w=majority&appName=Cluster0';
mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

const listSchema = new mongoose.Schema({
    name: String,
    providers: [String], // Array of NPIS
    createdAt: { type: Date, default: Date.now },
});

const List = mongoose.model('List', listSchema);

app.use(cors());
app.use(express.json());

const fetchNpiData = async (params) => {
    try {
        const urlParams = new URLSearchParams(params);
        // console.log('Fetching NPI data with params:', urlParams.toString());
        const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${urlParams.toString()}`);
        if (!response.ok) {
            throw new Error(`NPI Registry API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching from NPI Registry:', error);
        throw error;
    }
};

app.get('/api/providers', async (req, res) => {
    try {
        const params = {
            version: '2.1',
            limit: 20,
            skip: 0,
            ...req.query,
        };
        const data = await fetchNpiData(params);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch providers' });
    }
});

app.post('/api/lists', async (req, res) => {
    try {
        const { listName } = req.body;
        if (!listName) {
            return res.status(400).json({ error: 'List name is required' });
        }
        const newList = new List({ name: listName, providers: [] });
        const savedList = await newList.save();
        res.status(201).json({ id: savedList._id, name: savedList.name });
    } catch (error) {
        console.error('Error creating list:', error);
        res.status(500).json({ error: 'Failed to create list' });
    }
});

app.post('/api/lists/:listId/providers', async (req, res) => {
    try {
        const { listId } = req.params;
        const { providerNpis } = req.body;

        if (!mongoose.Types.ObjectId.isValid(listId)) {
            return res.status(400).json({ error: 'Invalid list ID' });
        }

        if (!Array.isArray(providerNpis) || providerNpis.length === 0) {
            return res.status(400).json({ error: 'Provider NPIS are required' });
        }

        const list = await List.findById(listId);
        if (!list) {
            return res.status(404).json({ error: 'List not found' });
        }

        const uniqueProviderNpis = new Set([...list.providers, ...providerNpis]);
        list.providers = Array.from(uniqueProviderNpis);
        await list.save();

        res.json({ message: 'Providers added to list', listId: listId });
    } catch (error) {
        console.error('Error adding providers to list:', error);
        res.status(500).json({ error: 'Failed to add providers to list' });
    }
});

app.get('/api/lists/:listId/providers', async (req, res) => {
    try {
        const { listId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(listId)) {
            return res.status(400).json({ error: 'Invalid list ID' });
        }

        const list = await List.findById(listId);
        if (!list) {
            return res.status(404).json({ error: 'List not found' });
        }

        const npiList = list.providers;

        if (npiList.length === 0) {
            return res.json({ results: [], result_count: 0 });
        }

        // Fetch data for each NPI one by one
        const results = [];
        for (const npi of npiList) {
            try {
                const params = {
                    version: '2.1',
                    number: npi,
                };
                const data = await fetchNpiData(params);
                if (data?.results?.length > 0) {
                    results.push(...data.results);
                }
            } catch (error) {
                console.error(`Error fetching data for NPI ${npi}:`, error);
            }
        }

        res.json({ results, result_count: results.length });
    } catch (error) {
        console.error('Error fetching providers for list:', error);
        res.status(500).json({ error: 'Failed to fetch providers for list' });
    }
});

const initiateEmailSearch = async (firstName, lastName, domainOrCompany) => {
    try {
        const response = await fetch(`${ICYPEAS_BASE_URL}/email-search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ICYPEAS_API_KEY,
            },
            body: JSON.stringify({ firstname: firstName, lastname: lastName, domainOrCompany }),
        });
        if (!response.ok) {
            const error = await response.json();
            console.error('Icypeas initiate error:', error);
            return { success: false, error: error };
        }
        const data = await response.json();
        console.log('Icypeas initiate response:', data);
        return await data;
    } catch (error) {
        console.error('Error initiating Icypeas email search:', error);
        return { success: false, error: 'Failed to initiate email search' };
    }
};

const checkEmailSearchStatus = async (searchId) => {
    try {
        const response = await fetch(`${ICYPEAS_BASE_URL}/bulk-single-searchs/read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ICYPEAS_API_KEY,
            },
            body: JSON.stringify({ id: searchId }),
        });
        if (!response.ok) {
            const error = await response.json();
            console.error('Icypeas check status error:', error);
            return { success: false, error: error };
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error checking Icypeas search status:', error);
        return { success: false, error: 'Failed to check search status' };
    }
};


app.post('/api/providers/:npi/find-email', async (req, res) => {
    const { npi } = req.params;
    const { firstName, lastName, organizationName } = req.body;

    if (!firstName || !lastName || !organizationName) {
        return res.status(400).json({ error: 'First name, last name, and organization name are required' });
    }

    try {
        // 1. Check if email is already found
        const existing = await EmailSearchResult.findOne({ npi });
        if (existing?.email) {
            return res.json({ npi, email: existing.email });
        }

        // 2. If not found, insert pending record (once only)
        if (!existing) {
            await EmailSearchResult.create({ npi, status: 'PENDING', createdAt: new Date() });

            // 3. Start background task
            setTimeout(async () => {
                try {
                    const initiateResult = await initiateEmailSearch(firstName, lastName, organizationName);

                    if (!initiateResult.success) {
                        await EmailSearchResult.updateOne({ npi }, { status: 'FAILED', updatedAt: new Date() });
                        return;
                    }

                    const searchId = initiateResult.item._id;
                    let attempts = 0;
                    const maxAttempts = 20;
                    const delay = 10000; // 10 seconds between retries

                    while (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, delay));

                        const statusResult = await checkEmailSearchStatus(searchId);
                        if (!statusResult.success) {
                            continue;
                        }

                        const item = statusResult.items?.[0];
                        if (!item) continue;

                        if (item.status === 'DEBITED' && item.results?.emails?.length > 0) {
                            const email = item.results.emails[0].email;

                            await EmailSearchResult.updateOne(
                                { npi },
                                {
                                    email,
                                    status: 'FOUND',
                                    updatedAt: new Date()
                                }
                            );

                            const logMsg = `✅ Found email for NPI ${npi}: ${email} at ${new Date().toISOString()}\n`;
                            console.log(logMsg);

                            fs.appendFile(
                                path.join(__dirname, 'found-emails.log'),
                                logMsg,
                                err => { if (err) console.error('Log file write error:', err); }
                            );

                            return;
                        } else if (!['SCHEDULED', 'IN_PROGRESS', 'NONE'].includes(item.status)) {
                            await EmailSearchResult.updateOne({ npi }, { status: 'FAILED', updatedAt: new Date() });
                            return;
                        }

                        attempts++;
                    }

                    await EmailSearchResult.updateOne({ npi }, { status: 'FAILED', updatedAt: new Date() });

                } catch (err) {
                    console.error('❌ Error in background search task:', err);
                    await EmailSearchResult.updateOne({ npi }, { status: 'FAILED', updatedAt: new Date() });
                }
            }, 100); // delay to detach from main thread
        }

        // 4. If already pending or just created, return response
        return res.status(202).json({ npi, message: 'Email search in progress, please check in few minutes.' });

    } catch (error) {
        console.error("❌ Error finding email:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/providers/:npi/email-status', async (req, res) => {
    const { npi } = req.params;
    const record = await EmailSearchResult.findOne({ npi });

    if (!record) return res.status(404).json({ message: 'No search record found for this NPI' });

    if (record.status === 'FOUND') return res.json({ npi, email: record.email });
    return res.json({ npi, status: record.status });
});


app.get('/api/lists', async (req, res) => {
    try {
        // const lists = await List.find().select('_id name'); 
        const lists = await List.find(); 
        res.json(lists);
    } catch (error) {
        console.error('Error fetching lists:', error);
        res.status(500).json({ error: 'Failed to fetch lists' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});