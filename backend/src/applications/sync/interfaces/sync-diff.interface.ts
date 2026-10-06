// use FSTAT positions for stats array
import { F_SPECIAL_STAT } from '../constants/sync.js'

export type SyncFileStats = [boolean, number, number, number, string | null]

export type SyncFileSpecialStats = [F_SPECIAL_STAT, string | boolean]
