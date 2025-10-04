const https = require('https');
const fs = require('fs');
const path = require('path');

// Card values and suits for LowCard game
const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
const suits = { h: "HEARTS", d: "DIAMONDS", s: "SPADES", c: "CLUBS" };

// Map value to API format
const valueMap = {
  "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", 
  "10": "0", "j": "JACK", "q": "QUEEN", "k": "KING", "a": "ACE"
};

let downloaded = 0;
let total = values.length * Object.keys(suits).length;

async function downloadCard(value, suit) {
  const filename = `lc_${value}${suit}.png`;
  const filepath = path.join(__dirname, filename);
  
  // Skip if already exists
  if (fs.existsSync(filepath)) {
    downloaded++;
    console.log(`Skipped ${filename} (${downloaded}/${total})`);
    return Promise.resolve();
  }

  const apiValue = valueMap[value];
  const apiSuit = suits[suit];
  const url = `https://deckofcardsapi.com/static/img/${apiValue}${apiSuit[0]}.png`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${filename}: ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        downloaded++;
        console.log(`Downloaded ${filename} (${downloaded}/${total})`);
        resolve();
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function downloadAllCards() {
  console.log(`Downloading ${total} card images...`);
  
  for (const value of values) {
    for (const suit of Object.keys(suits)) {
      try {
        await downloadCard(value, suit);
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`Error downloading ${value}${suit}:`, err.message);
      }
    }
  }
  
  console.log('Download complete!');
}

downloadAllCards();
