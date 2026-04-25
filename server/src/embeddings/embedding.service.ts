import { pipeline, type FeatureExtractionPipeline, env } from '@xenova/transformers';

env.cacheDir = process.env.EMBEDDINGS_CACHE_DIR ?? './.cache/transformers';
env.allowRemoteModels = true;

const MODEL_NAME = 'Xenova/multilingual-e5-small';

let embedder: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;
  if (!loadingPromise) {
    console.log('[embeddings] loading model', MODEL_NAME, '...');
    loadingPromise = pipeline('feature-extraction', MODEL_NAME).then((e) => {
      console.log('[embeddings] model ready');
      embedder = e as FeatureExtractionPipeline;
      return embedder;
    });
  }
  return loadingPromise;
}

export async function preloadEmbeddings(): Promise<void> {
  await getEmbedder();
}

export async function embedPassage(text: string): Promise<number[]> {
  const e = await getEmbedder();
  const output = await e('passage: ' + text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}

export async function embedQuery(text: string): Promise<number[]> {
  const e = await getEmbedder();
  const output = await e('query: ' + text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function vectorToBuffer(v: number[]): Buffer {
  const buf = Buffer.allocUnsafe(v.length * 4);
  for (let i = 0; i < v.length; i++) buf.writeFloatLE(v[i], i * 4);
  return buf;
}

export function bufferToVector(buf: Buffer): number[] {
  const v: number[] = new Array(buf.length / 4);
  for (let i = 0; i < v.length; i++) v[i] = buf.readFloatLE(i * 4);
  return v;
}
