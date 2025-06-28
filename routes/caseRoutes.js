const express = require('express')
const router = express.Router()
const caseController = require('../controllers/caseController')

router.post('/upload', caseController.uploadAndProcess)
router.post('/generate', caseController.generateDraft)
router.post('/download', caseController.downloadPDF)
router.post('/ask', caseController.askQuestion)
router.post('/summarize', caseController.summarizeCase)
router.post('/flaws', caseController.detectLegalFlaws)

// 🆕 History routes
router.get('/history', caseController.getCaseHistory)
router.get('/history/:id', caseController.getDraftById)
router.delete('/history/:id', caseController.deleteDraft)
router.post('/suggest-clauses', caseController.suggestClauses)

module.exports = router
