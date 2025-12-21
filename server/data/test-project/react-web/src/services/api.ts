/**
 * API Service
 * Centralized API client with authentication
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  async get<T>(url: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async post<T>(url: string, data: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async put<T>(url: string, data: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async delete(url: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }
}

export const api = new ApiService();
export default api;

