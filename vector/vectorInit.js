const { buildIndex } = require('./vectorStore')

// Dummy context for testing
const dummyParagraphs = [
  'FIR was registered under section 498A and 406 IPC.',
  'The accused was granted interim bail.',
  'Complainant claims mental harassment due to dowry.',
  'No physical evidence was submitted to the court.',
  'Statements recorded under Section 161 of CrPC.',
]

async function initVectorIndex() {
  try {
    console.log('🔍 Initializing vector index...')
    await buildIndex(dummyParagraphs)
    console.log('✅ Vector index ready for question answering.')
  } catch (err) {
    console.error('❌ Vector index init failed:', err)
  }
}

module.exports = { initVectorIndex }
