const { OpenAI } = require('openai')
const faiss = require('faiss-node')
require('dotenv').config()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

let index = null
let paragraphList = []

async function embed(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  })
  return res.data[0].embedding
}

async function buildIndex(paragraphs) {
  paragraphList = paragraphs

  const embeddings = await Promise.all(paragraphs.map(embed))
  const dim = embeddings[0].length

  const vectors = embeddings.map(vec => new Float32Array(vec)) // ✅ key fix

  index = new faiss.IndexFlatL2(dim)
  index.add(vectors)
  console.log(`✅ Index built with ${vectors.length} vectors.`)
}

async function searchSimilar(question, k = 3) {
  if (!index) throw new Error('❌ FAISS index not initialized')

  const queryVector = await embed(question)
  const results = index.search(new Float32Array(queryVector), k)

  return Array.from(results.ids)
    .filter(i => i !== -1)
    .map(i => paragraphList[i])
}

module.exports = { buildIndex, searchSimilar }
