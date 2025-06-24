const express = require('express')
const cors = require('cors')
const fileUpload = require('express-fileupload')
const dotenv = require('dotenv')
const caseRoutes = require('./routes/caseRoutes')
require('./vector/vectorInit.js')

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())
app.use(fileUpload())

// Register routes
app.use('/api/case', caseRoutes)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
