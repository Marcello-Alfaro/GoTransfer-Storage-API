## GoTransfer Storage API

A file storage microservice built in Node.js for handling file uploads, downloads, and deletions. Designed to work alongside the main GoTransfer API to enable scalable file distribution across multiple servers.

### Features

- Handles file upload and download requests
- Stores uploaded files with unique IDs
- Uses WebSockets for real-time communication with the main GoTransfer API
- Designed for scalability and performance

### Technologies Used

- Node.js
- WebSockets
- File system (fs-extra)

### Prerequisites

- Node.js v22+
- Enough disk space for uploaded files

### Environment Variables

Create a `.env` file in the root directory with the following settings:

- `NODE_EV`: "development"
- `LOGS_DESTINATION`: Leave blank "" if running in "development"
- `JWT_SECRET`: Jsonwebtoken secret string (e.g., `somesupersecretkey`)
- `API_URL`: Base URL of the main API (used by the front-end and storage API to communicate)
- `API_PATH`: Root path of the main API
- `DISKS`: JSON array of available disks on the server, where each disk has a unique ID and its corresponding path (e.g., [{"id":"`your-generated-uuidv4`", "path":"C:"}, {"id":"`your-generated-uuidv4`", "path": "E:"}])

### How to Run

- Clone the repository

- Install dependencies: npm install

- Set up your .env file with the appropriate values

- Start the server: npm run start:dev

### Notes

This service is not meant to be accessed directly by end users. It is used by the main GoTransfer API for upload and download operations.

**⚠️ Disclaimer**: This project is intended for academic demonstration purposes only. Redistribution or commercial use is not permitted without prior permission.
