/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { FILE_MODE } from '../../constants/operations'

export interface OnlyOfficeConvertForm {
  key: string
  url: string
  outputtype: string
  filetype: string
  async: boolean
  token?: string
}

export interface OnlyOfficeConfig {
  documentType?: string
  token?: string
  type?: 'mobile' | 'desktop'
  height?: string
  width?: string
  document?: {
    fileType: string
    key: string
    referenceData?: {
      fileKey: string
      instanceId: string
    }
    title: string
    url: string
    info?: {
      owner?: string
      uploaded?: string
      favorite?: boolean
      folder?: string
      sharingSettings?: any[]
    }
    permissions?: {
      /**
       * @deprecated Deprecated since version 5.5, please add the onRequestRestore field instead.
       */
      changeHistory?: boolean
      chat?: boolean
      comment?: boolean
      commentGroups?: any
      copy?: boolean
      deleteCommentAuthorOnly?: boolean
      download?: boolean
      edit?: boolean
      editCommentAuthorOnly?: boolean
      fillForms?: boolean
      modifyContentControl?: boolean
      modifyFilter?: boolean
      print?: boolean
      protect?: boolean
      review?: boolean
      reviewGroups?: string[]
      userInfoGroups?: string[]
    }
  }
  editorConfig?: {
    actionLink?: any
    callbackUrl?: string
    coEditing?: {
      mode: string
      change: boolean
    }
    createUrl?: string
    lang?: string
    mode?: FILE_MODE
    recent?: any[]
    region?: string
    templates?: any[]
    user?: {
      group?: string
      id?: string
      image?: string
      name?: string
    }
    customization?: {
      anonymous?: {
        request?: boolean
        label?: string
      }
      autosave?: boolean
      forcesave?: boolean
      close?: {
        visible: boolean
        text: string
      }
      comments?: boolean
      compactHeader?: boolean
      compactToolbar?: boolean
      compatibleFeatures?: boolean
      customer?: {
        address?: string
        info?: string
        logo?: string
        logoDark?: string
        mail?: string
        name?: string
        phone?: string
        www?: string
      }
      features?: any
      feedback?: any
      goback?: any
      help?: boolean
      hideNotes?: boolean
      hideRightMenu?: boolean
      hideRulers?: boolean
      integrationMode?: string
      logo?: {
        image?: string
        imageDark?: string
        imageLight?: string
        imageEmbedded?: string
        url?: string
        visible?: boolean
      }
      macros?: boolean
      macrosMode?: string
      mentionShare?: boolean
      mobileForceView?: boolean
      plugins?: boolean
      review?: {
        hideReviewDisplay?: boolean
        hoverMode?: boolean
        reviewDisplay?: string
        showReviewChanges?: boolean
        trackChanges?: boolean
      }
      submitForm?: boolean
      toolbarHideFileName?: boolean
      toolbarNoTabs?: boolean
      uiTheme?: string
      unit?: string
      zoom?: number
      about?: boolean
    }
    embedded?: {
      embedUrl?: string
      fullscreenUrl?: string
      saveUrl?: string
      shareUrl?: string
      toolbarDocked?: string
    }
    plugins?: {
      autostart?: string[]
      options?: {
        all?: any
        pluginGuid: any
      }
      pluginsData?: string[]
    }
  }
  events?: {
    onAppReady?: (event: object) => void
    onCollaborativeChanges?: (event: object) => void
    onDocumentReady?: (event: object) => void
    onDocumentStateChange?: (event: { data: boolean }) => void
    onDownloadAs?: (event: object) => void
    onError?: (event: object) => void
    onInfo?: (event: object) => void
    onMetaChange?: (event: object) => void
    onMakeActionLink?: (event: object) => void
    onRequestRefreshFile?: (event: object) => void
    onPluginsReady?: (event: object) => void
    onReady?: (event: object) => void
    onRequestClose?: (event: object) => void
    onRequestCreateNew?: (event: object) => void
    onRequestEditRights?: (event: object) => void
    onRequestHistory?: (event: object) => void
    onRequestHistoryClose?: (event: object) => void
    onRequestHistoryData?: (event: object) => void
    onRequestInsertImage?: (event: object) => void
    onRequestOpen?: (event: object) => void
    onRequestReferenceData?: (event: object) => void
    onRequestReferenceSource?: (event: object) => void
    onRequestRename?: (event: object) => void
    onRequestRestore?: (event: object) => void
    onRequestSaveAs?: (event: object) => void
    onRequestSelectDocument?: (event: object) => void
    onRequestSelectSpreadsheet?: (event: object) => void
    onRequestSendNotify?: (event: object) => void
    onRequestSharingSettings?: (event: object) => void
    onRequestStartFilling?: (event: object) => void
    onRequestUsers?: (event: object) => void
    onSubmit?: (event: object) => void
    onWarning?: (event: object) => void
  }
}

export interface OnlyOfficeCallBack {
  /* documentation :  https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/ */
  key: string // document key
  /*
    status:
      1 - document is being edited
      2 - document is ready for saving
      3 - document saving error has occurred
      4 - document is closed with no changes
      6 - document is being edited, but the current document state is saved
      7 - error has occurred while force saving the document
   */
  status: 1 | 2 | 3 | 4 | 6 | 7
  url?: string // link to download the modified version (for status: 2, 3, 6 or 7)
  notmodified?: boolean // only with status 2
  /*
    actions:
      0 - the user disconnects from the document co-editing
      1 - the new user connects to the document co-editing
      2 - the user clicks the forcesave button.
   */
  actions?: { type: 0 | 1 | 2; userid: string }[]
  forcesavetype?: 0 | 1 | 2 | 3 // The type is present when the status value is equal to 6 or 7 only
  /*
    forcesavetype:
      0 - to the command service
      1 - each time the saving is done (e.g. the Save button is clicked), which is only available when the forcesave option is set to true
      2 - by timer with the settings from the server config
      3 - each time the form is submitted (e.g. the Complete & Submit button is clicked)
   */
  users?: string[] // when multiple users are editing the document
}
