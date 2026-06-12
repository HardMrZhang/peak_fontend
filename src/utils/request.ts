import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { message } from 'antd'
import type { ApiResponse } from '@/types'

// 部分接口（如空投参与）由调用方自行提示错误，跳过全局错误弹窗
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipErrorToast?: boolean
  }
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('peak_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

request.interceptors.response.use(
  (response) => {
    const res = response.data as ApiResponse
    if (res.code !== 0) {
      if (!response.config?.skipErrorToast) {
        message.error(res.message || 'Request failed')
      }
      if (res.code === 401) {
        localStorage.removeItem('peak_token')
        window.dispatchEvent(new CustomEvent('auth:logout'))
      }
      return Promise.reject(new Error(res.message))
    }
    return response.data
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      localStorage.removeItem('peak_token')
      window.dispatchEvent(new CustomEvent('auth:logout'))
    } else if (!error?.config?.skipErrorToast) {
      const serverMsg = error?.response?.data?.message
      message.error(serverMsg || error.message || 'Network error')
    }
    return Promise.reject(error)
  },
)

export function get<T>(url: string, config?: AxiosRequestConfig) {
  return request.get<unknown, ApiResponse<T>>(url, config)
}

export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return request.post<unknown, ApiResponse<T>>(url, data, config)
}

export function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
  return request.put<unknown, ApiResponse<T>>(url, data, config)
}

export function del<T>(url: string, config?: AxiosRequestConfig) {
  return request.delete<unknown, ApiResponse<T>>(url, config)
}

export default request
