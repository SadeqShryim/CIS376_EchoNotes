export type UploadSuccessResponse = {
  audio_file_id: string
  filename: string
  size: number
  mime: string
  created_at: string
}

const API_BASE_URL = 'http://127.0.0.1:8000'
const USE_MOCK_UPLOAD = true

export async function uploadAudioFile(file: File): Promise<UploadSuccessResponse> {
  if (USE_MOCK_UPLOAD) {
    await new Promise((resolve) => setTimeout(resolve, 1200))

    return {
      audio_file_id: `audio_${Date.now()}`,
      filename: file.name,
      size: file.size,
      mime: file.type || 'unknown',
      created_at: new Date().toISOString(),
    }
  }

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/files/upload`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.detail || 'Upload failed.')
  }

  return data
}