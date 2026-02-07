const fs = require("fs");
const path = require("path");

// Read the content files and write them
const files = JSON.parse(fs.readFileSync("_files.json", "utf-8"));
for (const [filePath, content] of Object.entries(files)) {
  fs.writeFileSync(filePath, content);
  console.log("Wrote:", filePath, "("+content.length+" bytes)");
}