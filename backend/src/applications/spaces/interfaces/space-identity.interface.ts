import type { SpaceProps } from '../models/space-props.model.js'

export type SpaceIdentity = Pick<SpaceProps, 'id' | 'alias' | 'name'> & Partial<Omit<SpaceProps, 'id' | 'alias' | 'name'>>
