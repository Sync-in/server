/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const ONLY_OFFICE_INTERNAL_URI = '/onlyoffice' // used by nginx as a proxy
export const ONLY_OFFICE_CONTEXT = 'OnlyOfficeEnvironment' as const
export const ONLY_OFFICE_TOKEN_QUERY_PARAM_NAME = 'token' as const
export const ONLY_OFFICE_OWNER_LOCK = 'OnlyOffice' as const
export const ONLY_OFFICE_CACHE_KEY = 'foffice' as const

export const ONLY_OFFICE_EXTENSIONS = {
  VIEWABLE: new Map<string, 'word' | 'cell' | 'slide' | 'pdf' | 'diagram'>([
    // WORD
    ['doc', 'word'],
    ['docm', 'word'],
    ['docx', 'word'],
    ['dot', 'word'],
    ['dotm', 'word'],
    ['dotx', 'word'],
    ['epub', 'word'],
    ['fb2', 'word'],
    ['fodt', 'word'],
    ['gdoc', 'word'],
    ['htm', 'word'],
    ['html', 'word'],
    ['hwp', 'word'],
    ['hwpx', 'word'],
    ['mht', 'word'],
    ['mhtml', 'word'],
    ['odt', 'word'],
    ['ott', 'word'],
    ['pages', 'word'],
    ['rtf', 'word'],
    ['stw', 'word'],
    ['sxw', 'word'],
    ['wps', 'word'],
    ['wpt', 'word'],

    // CELL
    ['csv', 'cell'],
    ['et', 'cell'],
    ['ett', 'cell'],
    ['fods', 'cell'],
    ['gsheet', 'cell'],
    ['numbers', 'cell'],
    ['ods', 'cell'],
    ['ots', 'cell'],
    ['sxc', 'cell'],
    ['xls', 'cell'],
    ['xlsm', 'cell'],
    ['xlsx', 'cell'],
    ['xlt', 'cell'],
    ['xltm', 'cell'],
    ['xltx', 'cell'],

    // SLIDE
    ['dps', 'slide'],
    ['dpt', 'slide'],
    ['fodp', 'slide'],
    ['gslide', 'slide'],
    ['key', 'slide'],
    ['odg', 'slide'],
    ['odp', 'slide'],
    ['otp', 'slide'],
    ['pot', 'slide'],
    ['potm', 'slide'],
    ['potx', 'slide'],
    ['pps', 'slide'],
    ['ppsm', 'slide'],
    ['ppsx', 'slide'],
    ['ppt', 'slide'],
    ['pptm', 'slide'],
    ['pptx', 'slide'],
    ['sxi', 'slide'],

    // PDF
    ['djvu', 'pdf'],
    ['docxf', 'pdf'],
    ['oform', 'pdf'],
    ['oxps', 'pdf'],
    ['pdf', 'pdf'],
    ['xps', 'pdf'],

    // DIAGRAM
    ['vsdm', 'diagram'],
    ['vsdx', 'diagram'],
    ['vssm', 'diagram'],
    ['vssx', 'diagram'],
    ['vstm', 'diagram'],
    ['vstx', 'diagram']
  ]),

  EDITABLE: new Map<string, 'word' | 'cell' | 'slide' | 'pdf'>([
    // WORD
    ['doc', 'word'],
    ['docm', 'word'],
    ['docx', 'word'],
    ['dotm', 'word'],
    ['dotx', 'word'],
    ['epub', 'word'],
    ['fb2', 'word'],
    ['html', 'word'],
    ['odt', 'word'],
    ['ott', 'word'],
    ['rtf', 'word'],

    // CELL
    ['xlsb', 'cell'],
    ['xlsm', 'cell'],
    ['xls', 'cell'],
    ['xlsx', 'cell'],
    ['xltm', 'cell'],
    ['xltx', 'cell'],
    ['csv', 'cell'],
    ['ods', 'cell'],
    ['ots', 'cell'],

    // SLIDE
    ['potm', 'slide'],
    ['potx', 'slide'],
    ['ppsm', 'slide'],
    ['ppsx', 'slide'],
    ['pptm', 'slide'],
    ['ppt', 'slide'],
    ['pptx', 'slide'],
    ['odp', 'slide'],
    ['otp', 'slide'],

    // PDF
    ['pdf', 'pdf']
  ])
}

export const ONLY_OFFICE_CONVERT_EXTENSIONS = {
  ALLOW_AUTO: new Set(['doc', 'xls', 'ppt']),
  FROM: new Set([
    'doc',
    'docm',
    'docx',
    'docxf',
    'dotx',
    'epub',
    'fb2',
    'html',
    'mhtml',
    'odt',
    'ott',
    'pdf',
    'rtf',
    'stw',
    'sxw',
    'wps',
    'wpt',
    'xps'
  ]),
  TO: new Set(['docx', 'docxf', 'dotx', 'epub', 'fb2', 'html', 'jpg', 'odt', 'ott', 'pdf', 'png', 'rtf', 'txt'])
}

export const ONLY_OFFICE_CONVERT_ERROR = new Map([
  [-9, 'error conversion output format'],
  [-8, 'error document VKey'],
  [-7, 'error document request'],
  [-6, 'error database'],
  [-5, 'incorrect password'],
  [-4, 'download error'],
  [-3, 'convert error'],
  [-2, 'convert error timeout'],
  [-1, 'convert unknown']
])
