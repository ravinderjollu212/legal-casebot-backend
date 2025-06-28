require('dotenv').config()
const pdfParse = require('pdf-parse')
const { OpenAI } = require('openai')
const PDFDocument = require('pdfkit')
const { JSDOM } = require('jsdom')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

let parsedText = ''
let generatedDraft = ''
let chatHistory = []
let caseHistory = []

exports.uploadAndProcess = async (req, res) => {
  try {
    const uploaded = req.files?.documents
    if (!uploaded) return res.status(400).json({ error: 'No documents uploaded.' })

    const files = Array.isArray(uploaded) ? uploaded : [uploaded]

    const MAX_SIZE_MB = 5
    const ALLOWED_TYPES = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]

    let combinedText = ''

    for (const file of files) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        console.warn(`Skipping large file: ${file.name}`)
        continue
      }

      if (!ALLOWED_TYPES.includes(file.mimetype)) {
        console.warn(`Skipping unsupported type: ${file.name}`)
        continue
      }

      if (file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(file.data)
        combinedText += pdfData.text + '\n\n'
      } else if (file.mimetype === 'text/plain') {
        combinedText += file.data.toString('utf-8') + '\n\n'
      } else if (file.mimetype.includes('wordprocessingml')) {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ buffer: file.data })
        combinedText += result.value + '\n\n'
      }
    }

    if (!combinedText.trim()) {
      return res.status(400).json({ error: 'No valid content extracted.' })
    }

    parsedText = combinedText
    generatedDraft = ''

    res.json({ message: 'Files uploaded and parsed successfully.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Error while parsing documents.' })
  }
}

exports.generateDraft = async (req, res) => {
  const { draftType } = req.body

  if (!parsedText.trim())
    return res.status(400).json({ error: 'No case content found. Please upload a document first.' })

  if (!draftType)
    return res.status(400).json({ error: 'Draft type is required.' })

  let prompt

  switch (draftType) {
    case 'Quash Petition':
      prompt = `
You are a senior legal drafter. Draft a highly formal **Quash Petition under Section 482 of CrPC**, following the structure of Indian High Court pleadings. Format your response using headings and paragraphs similar to actual court filings.

Ensure the draft includes:

1. Court heading (e.g., IN THE HON'BLE HIGH COURT OF KARNATAKA)
2. Petition number, parties and representation
3. MEMORANDUM OF PETITION under Section 482 of CrPC
4. Structured sections:
   - Facts of the Case (with bullet points if needed)
   - Grounds for Quashing
   - Judicial Precedents (if applicable)
   - Prayer
   - Verification

Style guidelines:
- Use formal legal language.
- Indent paragraphs, align properly.
- Do not add any extra instructions or notes.
- Output plain text (no HTML).

Here is the extracted case content to base the petition on:

${parsedText.trim()}
      `.trim()
      break

    case 'Bail Application':
      prompt = `You are a legal assistant. Draft a formal Bail Application in Indian legal format using the following case facts:\n\n${parsedText}`.trim()
      break

    case 'Discharge Application':
      prompt = `You are a legal assistant. Draft a formal Discharge Application in Indian legal format using the following case details:\n\n${parsedText}`.trim()
      break

    case 'Case Summary':
      prompt = `You are a legal assistant. Summarize the following case in 200-300 words in clear, professional language:\n\n${parsedText}`.trim()
      break

    default:
      return res.status(400).json({ error: 'Invalid draft type.' })
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })

    generatedDraft = response.choices[0].message.content

    const entry = {
      id: Date.now().toString(),
      draftType,
      generatedDraft,
      createdAt: new Date()
    }

    caseHistory.push(entry)

    res.json({ draft: generatedDraft })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate draft.' })
  }
}

exports.getCaseHistory = async (req, res) => {
  try {
    const summary = caseHistory.map(({ id, draftType, createdAt }) => ({ id, draftType, createdAt }))
    res.json({ history: summary })
  } catch {
    res.status(500).json({ error: 'Failed to fetch history.' })
  }
}

exports.getDraftById = async (req, res) => {
  const { id } = req.params
  const draft = caseHistory.find(item => item.id === id)

  if (!draft) return res.status(404).json({ error: 'Draft not found.' })

  res.json({ draft: draft.generatedDraft, draftType: draft.draftType })
}

exports.deleteDraft = (req, res) => {
  const { id } = req.params
  const index = caseHistory.findIndex(item => item.id === id)

  if (index === -1)
    return res.status(404).json({ error: 'Draft not found.' })

  caseHistory.splice(index, 1)
  res.json({ message: 'Draft deleted successfully.' })
}

exports.askQuestion = async (req, res) => {
  const { question } = req.body

  if (!parsedText.trim())
    return res.status(400).json({ error: 'No case content available.' })

  if (!question.trim())
    return res.status(400).json({ error: 'Question is empty.' })

  const messages = [
    { role: 'system', content: `You are a helpful legal assistant. Use only this case content:\n\n${parsedText}` },
    ...chatHistory,
    { role: 'user', content: question }
  ]

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages
    })

    const answer = response.choices[0].message.content
    chatHistory.push({ role: 'user', content: question }, { role: 'assistant', content: answer })

    res.json({ answer })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate answer.' })
  }
}

exports.downloadPDF = async (req, res) => {
  try {
    const { content } = req.body
    const draftType = req.query.type || 'Draft'

    if (!content?.trim())
      return res.status(400).json({ error: 'No draft content provided.' })

    const doc = new PDFDocument({ margin: 60 })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${draftType.replace(/\s+/g, '_')}.pdf`
    )

    doc.pipe(res)

    doc.fontSize(18).font('Times-Bold')
      .text("IN THE HON'BLE HIGH COURT OF KARNATAKA", { align: 'center' }).moveDown(0.5)
    doc.fontSize(14).text("AT BENGALURU", { align: 'center' }).moveDown(0.5)
    doc.text("CRIMINAL PETITION No. _______ OF 2025", { align: 'center' }).moveDown(2)
    doc.fontSize(14).font('Times-Bold')
      .text(`MEMORANDUM OF ${draftType.toUpperCase()}`, { align: 'center', underline: true })
      .moveDown(2)

    const dom = new JSDOM(content)
    const elements = dom.window.document.body.children

    for (const el of elements) {
      const text = el.textContent.trim()
      if (!text) continue

      if (el.tagName === 'P') {
        doc.font('Times-Roman').fontSize(12).text(text, {
          align: 'justify',
          lineGap: 4,
          paragraphGap: 8,
          indent: 20
        })
      } else if (el.tagName === 'STRONG') {
        doc.font('Times-Bold').fontSize(13).text(text, {
          align: 'left',
          paragraphGap: 8
        })
      } else {
        doc.font('Times-Roman').fontSize(12).text(text, {
          align: 'left',
          paragraphGap: 6
        })
      }
    }

    doc.moveDown(2)
    doc.fontSize(12)
      .text("Place: Bengaluru", { align: 'left' })
      .text("Date: ____/____/2025", { align: 'left' })
      .moveDown(2)
      .text("ADVOCATE FOR THE PETITIONER", { align: 'right' })

    doc.end()
  } catch (err) {
    console.error('PDF Error:', err)
    res.status(500).json({ error: 'Failed to generate PDF.' })
  }
}

exports.summarizeCase = async (req, res) => {
  if (!parsedText.trim())
    return res.status(400).json({ error: 'No case content available.' })

  try {
    const prompt = `Summarize this case in 5-7 bullet points. Include charges, facts, and legal sections:\n\n${parsedText}`
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })

    res.json({ summary: response.choices[0].message.content })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to summarize case.' })
  }
}

exports.detectLegalFlaws = async (req, res) => {
  if (!parsedText.trim())
    return res.status(400).json({ error: 'No FIR or case data found.' })

  try {
    const prompt = `You are a legal expert. Detect any flaws in this FIR:\n\n${parsedText}`
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })

    res.json({ flaws: response.choices[0].message.content })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to detect flaws.' })
  }
}

exports.suggestClauses = async (req, res) => {
  const { content } = req.body

  if (!content?.trim()) {
    return res.status(400).json({ error: 'Draft content is required.' })
  }

  try {
    const prompt = `
You are a legal assistant. Analyze this legal draft and suggest any missing or weak legal clauses. Respond as bullet points with each clause suggestion.

Draft:
${content}
    `.trim()

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })

    const suggestions = response.choices[0].message.content
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
      .map(line => line.replace(/^[-*]\s*/, '').trim())

    res.json({ suggestions })
  } catch (err) {
    console.error('Clause Suggestion Error:', err)
    res.status(500).json({ error: 'Failed to suggest clauses.' })
  }
}