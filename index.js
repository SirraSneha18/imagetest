import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer";
import fs from "fs";
import express from "express";
import path from "path";
import multer from "multer";
import { fileURLToPath } from 'url';  // To get the current file path in ES modules
import { dirname } from 'path';  // To resolve directory paths

// Resolve the current directory name (Equivalent to __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// Directory to save images
const savedImagesDir = path.join(__dirname, 'saved_images');
if (!fs.existsSync(savedImagesDir)) {
  fs.mkdirSync(savedImagesDir);  // Create the directory if it doesn't exist
}

// Setup multer to handle file uploads to memory (no file saved in 'uploads')
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Endpoint to handle document analysis
app.post("/analyze", upload.single("file"), async (req, res) => {
  const endpoint = "<your-azure-endpoint>";  // Azure endpoint
  const apiKey = "<your-api-key>";
  const modelId = "prebuilt-layout";

  // If no file uploaded
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const fileBuffer = req.file.buffer;

  const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));

  try {
    const poller = await client.beginAnalyzeDocument(modelId, fileBuffer, {
      onProgress: ({ status }) => {
        console.log(`status: ${status}`);
      },
    });

    const { documents, pages, tables } = await poller.pollUntilDone();

    let result = {
      documents: [],
      pages: [],
      tables: [],
    };

    // Process documents
    for (const document of documents || []) {
      result.documents.push({
        type: document.docType,
        fields: Object.entries(document.fields).map(([name, field]) => ({
          name,
          value: field.value,
          confidence: field.confidence,
        })),
      });
    }

    // Process pages
    for (const page of pages || []) {
      result.pages.push({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        unit: page.unit,
      });
    }

    // Process tables
    for (const table of tables || []) {
      result.tables.push({
        columnCount: table.columnCount,
        rowCount: table.rowCount,
        cells: table.cells.map(cell => ({
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          content: cell.content,
        })),
      });
    }

    // Get the file extension of the uploaded image
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Save the image to 'saved_images' with the correct file extension
    const savedImagePath = path.join(savedImagesDir, req.file.originalname);
    fs.writeFileSync(savedImagePath, fileBuffer);

    // Send image URL along with analysis result
    res.json({
      imageUrl: `http://localhost:${port}/image/${req.file.originalname}`,
      result,
    });
  } catch (error) {
    console.error("Error processing the document:", error);
    res.status(500).json({ error: "Error processing the document." });
  }
});

// Serve uploaded images through a GET request
app.get('/image/:filename', (req, res) => {
  const filePath = path.join(savedImagesDir, req.params.filename);

  if (fs.existsSync(filePath)) {
    const fileExtension = path.extname(filePath).toLowerCase();
    
    let contentType = 'application/octet-stream';
    if (fileExtension === '.jpg' || fileExtension === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (fileExtension === '.png') {
      contentType = 'image/png';
    } else if (fileExtension === '.gif') {
      contentType = 'image/gif';
    }

    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.status(404).send('Image not found');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});