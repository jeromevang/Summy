import axios from 'axios';
import fs from 'fs';

async function fetchModels() {
    try {
        const res = await axios.get('http://localhost:1234/v1/models');
        fs.writeFileSync('models.json', JSON.stringify(res.data, null, 2));
        console.log('Successfully fetched models');
    } catch (e: any) {
        console.error('Error fetching models:', e.message);
    }
}

fetchModels();
