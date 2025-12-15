export interface NutrientAPIUploadResponse {
  sessionToken: string;
  documentId: string;
}

export interface NutrientAPIError {
  message: string;
  status?: number;
}

export interface ViewerSessionData {
  sessionToken: string;
  documentId: string;
}

class NutrientAPIService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    const apiKey = process.env.NUTRIENT_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing Nutrient API key: NUTRIENT_API_KEY environment variable is required'
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = process.env.NUTRIENT_API_BASE_URL || 'https://api.nutrient.io/viewer/documents';
  }

  /**
   * Upload a file to Nutrient API and get a document ID
   */
  async uploadDocument(file: File): Promise<NutrientAPIUploadResponse> {
    try {
      // Convert file to ArrayBuffer for binary upload
      const fileBuffer = await file.arrayBuffer();

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': file.type,
        },
        body: fileBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Nutrient API upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Extract document ID from nested response structure
      const documentId = result.data?.document_id;

      if (!documentId) {
        throw new Error('Nutrient API did not return document ID in expected format');
      }

      // Check if the upload response already includes a session token
      const sessionToken = result.data?.session_token || result.sessionToken;

      if (sessionToken) {
        // Session token provided in upload response
        return {
          sessionToken,
          documentId,
        };
      }

      // Fall back to creating a session if not provided
      try {
        const sessionData = await this.createSession(documentId);
        return {
          sessionToken: sessionData.sessionToken,
          documentId,
        };
      } catch {
        // Return without session token - viewer can handle this case
        return {
          sessionToken: '', // Empty session token
          documentId,
        };
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a session token for viewing an existing document
   */
  async createSession(documentId: string): Promise<ViewerSessionData> {
    try {
      // Set expiration to 24 hours from now
      const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

      const sessionPayload = {
        allowed_documents: [
          {
            document_id: documentId,
            document_permissions: ['read'],
          },
        ],
        exp: exp,
      };

      const response = await fetch('https://api.nutrient.io/viewer/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Nutrient API session creation failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // The response might have the session token in different places
      // Check both camelCase and snake_case formats
      const sessionToken =
        result.data?.session_token ||
        result.sessionToken ||
        result.data?.sessionToken ||
        result.token ||
        result.jwt;

      if (!sessionToken) {
        throw new Error(
          `Session token not found in API response. Response structure: ${JSON.stringify(result)}`
        );
      }

      return {
        sessionToken: sessionToken,
        documentId,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Delete a document from Nutrient API
   * Note: Document deletion may not be supported by all Nutrient API plans
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/${documentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If deletion is not supported, silently return
        if (response.status === 405 || response.status === 501) {
          return;
        }
        throw new Error(`Nutrient API delete failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get the viewer URL for the Nutrient Viewer with JWT token
   */
  getViewerUrl(jwtToken: string): string {
    return `https://viewer.nutrient.io/?jwt=${encodeURIComponent(jwtToken)}`;
  }

  /**
   * Check if Nutrient API is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple check by attempting to create a session with a test document
      // This will return 404 for non-existent document but confirms API is reachable
      const response = await fetch(`${this.baseUrl}/test/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Any response (even 404) means the API is reachable
      return response.status !== 503;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Handle and format errors
   */
  private handleError(error: unknown): NutrientAPIError {
    if (error instanceof Error) {
      return {
        message: error.message,
        status: error.message.includes('fetch') ? 503 : 500,
      };
    }

    return {
      message: 'An unknown error occurred with Nutrient API',
      status: 500,
    };
  }

  /**
   * Retry wrapper for operations
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error = new Error('Retry operation failed');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }
}

// Lazy initialization to avoid instantiation during build
let _nutrientAPIService: NutrientAPIService | null = null;

function getNutrientAPIService(): NutrientAPIService {
  if (!_nutrientAPIService) {
    _nutrientAPIService = new NutrientAPIService();
  }
  return _nutrientAPIService;
}

// Export a Proxy that creates the service only when accessed
export const nutrientAPIService = new Proxy({} as NutrientAPIService, {
  get(_target, prop) {
    const service = getNutrientAPIService();
    const value = service[prop as keyof NutrientAPIService];

    if (typeof value === 'function') {
      return value.bind(service);
    }

    return value;
  },
});
