import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.NUTRIENT_API_KEY;
  const baseUrl = process.env.NUTRIENT_API_BASE_URL;

  if (!apiKey) {
    return NextResponse.json({ error: 'No API key found' }, { status: 500 });
  }

  try {
    // Simple test to see if API key is valid
    const response = await fetch(`${baseUrl}/test-document-id/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await response.text();

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: `${apiKey.substring(0, 12)}...`,
      baseUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        apiKeyLength: apiKey.length,
        apiKeyPrefix: `${apiKey.substring(0, 12)}...`,
        baseUrl,
      },
      { status: 500 }
    );
  }
}
