import { DEFAULT_STORAGE_QUOTA_FIELD } from './auth-providers.constants'

interface IdentityWithStorageQuota {
  storageQuota?: number | null
}

function parseStorageQuotaInBytes(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function applyStorageQuotaToIdentity<T extends IdentityWithStorageQuota>(
  identity: T,
  profile: Record<string, unknown>,
  fieldName = DEFAULT_STORAGE_QUOTA_FIELD
): void {
  if (!Object.hasOwn(profile, fieldName)) {
    return
  }

  const quota = profile[fieldName] === null ? null : parseStorageQuotaInBytes(profile[fieldName])
  if (quota === undefined) {
    return
  }

  identity.storageQuota = quota === 0 ? null : quota
}
