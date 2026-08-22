import { execFileSync } from 'node:child_process';

let cached = { token: null, at: 0 };

export async function gcloudAccessToken() {
  if (cached.token && Date.now() - cached.at < 50 * 60 * 1000) return cached.token;
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    timeout: 30000,
  }).trim();
  cached = { token, at: Date.now() };
  return token;
}

export function vertexUrl({ project, location = 'us-central1', model, stream = true }) {
  if (!project) throw new Error('vertex-ai needs config providers.vertex-ai.project (gcloud project id)');
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${
    stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
  }`;
}
