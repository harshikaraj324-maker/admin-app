export interface AdminApp {
  id: string;
  token: string;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Device {
  sub_id: string;
  app_id: string;
  uid: string;
  data_type: string;
  status: string;
  registered_at: number;
  created_at: number;
  updated_at: number;
  total_sms_count: number;
  last_sms_timestamp: number;
  data_json: DeviceData;
}

export interface DeviceData {
  model?: string;
  brand?: string;
  manufacturer?: string;
  androidversion?: string;
  device_name?: string;
  sim1number?: string;
  sim1carrier?: string;
  sim2number?: string;
  sim2carrier?: string;
  joinedat?: number;
  registered_at?: number;
  fcm_token?: string;
  fcm_token_status?: string;
  online_status?: string;
  online_checked_at?: number;
  last_seen_at?: number;
}

export interface AppStats {
  total: number;
  online: number;
  blocked: number;
  smsTotal: number;
}
