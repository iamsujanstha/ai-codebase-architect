import { 
  Settings, 
  Bell, 
  Shield, 
  CreditCard, 
  Mail, 
  Save
} from 'lucide-react';
import { useState } from 'react';
import styles from './Admin.module.css';

export function AdminSettings() {
  const [settings, setSettings] = useState({
    storeName: 'AI Commerce Platform',
    storeEmail: 'store@example.com',
    currency: 'USD',
    notifications: {
      newOrders: true,
      lowStock: true,
      newUsers: false,
      payments: true,
    },
    security: {
      twoFactor: false,
      sessionTimeout: '30',
      loginAttempts: '3',
    },
    email: {
      smtpHost: '',
      smtpPort: '587',
      username: '',
      password: '',
    },
  });

  const handleNotificationChange = (key: string, value: boolean) => {
    setSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: value,
      },
    });
  };

  const handleSecurityChange = (key: string, value: string | boolean) => {
    setSettings({
      ...settings,
      security: {
        ...settings.security,
        [key]: value,
      },
    });
  };

  const handleEmailChange = (key: string, value: string) => {
    setSettings({
      ...settings,
      email: {
        ...settings.email,
        [key]: value,
      },
    });
  };

  const handleSave = () => {
    // TODO: Implement save functionality
    alert('Settings saved successfully!');
  };

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>
          Configure your store settings and preferences
        </p>
      </div>

      <div className={styles.settingsGrid}>
        {/* General Settings */}
        <div className={styles.settingsCard}>
          <div className={styles.settingsHeader}>
            <Settings className={styles.settingsIcon} style={{ color: '#667eea' }} />
            <h2 className={styles.settingsTitle}>General Settings</h2>
          </div>
          <div className={styles.formSection}>
            <div>
              <label className={styles.formLabel}>Store Name</label>
              <input
                type="text"
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className={styles.formInput}
              />
            </div>
            <div>
              <label className={styles.formLabel}>Store Email</label>
              <input
                type="email"
                value={settings.storeEmail}
                onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
                className={styles.formInput}
              />
            </div>
            <div>
              <label className={styles.formLabel}>Currency</label>
              <select 
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className={styles.formSelect}
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className={styles.settingsCard}>
          <div className={styles.settingsHeader}>
            <Bell className={styles.settingsIcon} style={{ color: '#f59e0b' }} />
            <h2 className={styles.settingsTitle}>Notifications</h2>
          </div>
          <div className={styles.formSection}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>New Order Alerts</span>
              <div 
                className={`${styles.toggle} ${settings.notifications.newOrders ? styles.active : ''}`}
                onClick={() => handleNotificationChange('newOrders', !settings.notifications.newOrders)}
              />
            </div>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Low Stock Alerts</span>
              <div 
                className={`${styles.toggle} ${settings.notifications.lowStock ? styles.active : ''}`}
                onClick={() => handleNotificationChange('lowStock', !settings.notifications.lowStock)}
              />
            </div>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>New User Registration</span>
              <div 
                className={`${styles.toggle} ${settings.notifications.newUsers ? styles.active : ''}`}
                onClick={() => handleNotificationChange('newUsers', !settings.notifications.newUsers)}
              />
            </div>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Payment Notifications</span>
              <div 
                className={`${styles.toggle} ${settings.notifications.payments ? styles.active : ''}`}
                onClick={() => handleNotificationChange('payments', !settings.notifications.payments)}
              />
            </div>
          </div>
        </div>

        {/* Payment Settings */}
        <div className={styles.settingsCard}>
          <div className={styles.settingsHeader}>
            <CreditCard className={styles.settingsIcon} style={{ color: '#10b981' }} />
            <h2 className={styles.settingsTitle}>Payment Methods</h2>
          </div>
          <div className={styles.formSection}>
            <div className={styles.paymentMethod}>
              <div className={styles.paymentInfo}>
                <div className={styles.paymentIcon} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                  S
                </div>
                <div className={styles.paymentDetails}>
                  <div className={styles.paymentName}>Stripe</div>
                  <div className={styles.paymentStatus}>Connected</div>
                </div>
              </div>
              <span className={styles.statusActive}>
                Active
              </span>
            </div>
            <div className={styles.paymentMethod}>
              <div className={styles.paymentInfo}>
                <div className={styles.paymentIcon} style={{ background: '#dbeafe', color: '#2563eb' }}>
                  P
                </div>
                <div className={styles.paymentDetails}>
                  <div className={styles.paymentName}>PayPal</div>
                  <div className={styles.paymentStatus}>Not configured</div>
                </div>
              </div>
              <button className={styles.configureBtn}>
                Configure
              </button>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className={styles.settingsCard}>
          <div className={styles.settingsHeader}>
            <Shield className={styles.settingsIcon} style={{ color: '#dc2626' }} />
            <h2 className={styles.settingsTitle}>Security</h2>
          </div>
          <div className={styles.formSection}>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Two-Factor Authentication</span>
              <div className={styles.settingControl}>
                <div 
                  className={`${styles.toggle} ${settings.security.twoFactor ? styles.active : ''}`}
                  onClick={() => handleSecurityChange('twoFactor', !settings.security.twoFactor)}
                />
              </div>
            </div>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Session Timeout</span>
              <select 
                value={settings.security.sessionTimeout}
                onChange={(e) => handleSecurityChange('sessionTimeout', e.target.value)}
                className={styles.formSelect}
                style={{ width: 'auto', minWidth: '120px' }}
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="240">4 hours</option>
                <option value="1440">24 hours</option>
              </select>
            </div>
            <div className={styles.settingItem}>
              <span className={styles.settingLabel}>Login Attempts</span>
              <select 
                value={settings.security.loginAttempts}
                onChange={(e) => handleSecurityChange('loginAttempts', e.target.value)}
                className={styles.formSelect}
                style={{ width: 'auto', minWidth: '120px' }}
              >
                <option value="3">3 attempts</option>
                <option value="5">5 attempts</option>
                <option value="10">10 attempts</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Email Settings - Full Width */}
      <div className={styles.settingsCard} style={{ marginTop: '1.5rem' }}>
        <div className={styles.settingsHeader}>
          <Mail className={styles.settingsIcon} style={{ color: '#6366f1' }} />
          <h2 className={styles.settingsTitle}>Email Configuration</h2>
        </div>
        <div className={styles.formGrid}>
          <div>
            <label className={styles.formLabel}>SMTP Host</label>
            <input
              type="text"
              placeholder="smtp.example.com"
              value={settings.email.smtpHost}
              onChange={(e) => handleEmailChange('smtpHost', e.target.value)}
              className={styles.formInput}
            />
          </div>
          <div>
            <label className={styles.formLabel}>SMTP Port</label>
            <input
              type="number"
              placeholder="587"
              value={settings.email.smtpPort}
              onChange={(e) => handleEmailChange('smtpPort', e.target.value)}
              className={styles.formInput}
            />
          </div>
          <div>
            <label className={styles.formLabel}>Username</label>
            <input
              type="text"
              value={settings.email.username}
              onChange={(e) => handleEmailChange('username', e.target.value)}
              className={styles.formInput}
            />
          </div>
          <div>
            <label className={styles.formLabel}>Password</label>
            <input
              type="password"
              value={settings.email.password}
              onChange={(e) => handleEmailChange('password', e.target.value)}
              className={styles.formInput}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={handleSave}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          <Save size={20} />
          Save All Settings
        </button>
      </div>

      {/* Warning Notice */}
      <div className={styles.warningBox}>
        <p className={styles.warningText}>
          <strong>Note:</strong> Settings functionality is currently in development. 
          These controls are placeholders for demonstration purposes.
        </p>
      </div>
    </div>
  );
}
