import { SetMetadata } from '@nestjs/common'

export const AVAILABILITY_SKIP = 'availabilitySkip'
export const AvailabilitySkip = () => SetMetadata(AVAILABILITY_SKIP, true)
