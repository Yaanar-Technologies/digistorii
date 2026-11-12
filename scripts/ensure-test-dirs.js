const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), 'test-results', 'screenshots');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
  console.log('Created directory:', dir);
} else {
  console.log('Directory already exists:', dir);
}

