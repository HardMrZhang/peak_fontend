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
    const errorCode = error?.response?.data?.errorCode
    if (status === 401 || errorCode === 'ACCOUNT_DISABLED') {
      localStorage.removeItem('peak_token')
      window.dispatchEvent(new CustomEvent('auth:logout'))
      if (errorCode === 'ACCOUNT_DISABLED' && !error?.config?.skipErrorToast) {
        const serverMsg = error?.response?.data?.message
        message.error(serverMsg || 'Account disabled')
      }
    } else if (!error?.config?.skipErrorToast) {
      const serverMsg = error?.response?.data?.message
      message.error(serverMsg || error.message || 'Network error')
    }
    return Promise.reject(error)
  },
)

/**
 * 取原始响应体（不走 {code,data} 信封）。
 *
 * 合同下载接口直接返回一整篇 HTML，套不进统一信封，而主实例的响应拦截器
 * 会把 code !== 0 判成失败，所以这里用一个只加鉴权头的独立实例。
 */
const rawRequest = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
})

rawRequest.interceptors.request.use((config) => {
  const token = localStorage.getItem('peak_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function getText(url: string, config?: AxiosRequestConfig) {
  return rawRequest.get<string>(url, {
    responseType: 'text',
    // 关掉 axios 的自动 JSON 解析，保证拿到的是原样字符串
    transformResponse: [(data) => data],
    ...config,
  })
}

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
