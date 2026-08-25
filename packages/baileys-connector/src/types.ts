import type { Proto } from 'zapo-js/proto'

/**
 * Baileys-compatible type surface, re-declared here so applications can drop
 * `@whiskeysockets/baileys` from their dependency tree entirely. The shapes
 * mirror the ones the upstream library exposes; anything the connector cannot
 * back with zapo-js is documented in the package README compatibility matrix.
 */

export type WAConnectionState = 'open' | 'connecting' | 'close'

export type WABrowserDescription = readonly [string, string, string]

export type WAVersion = readonly [number, number, number]

export interface Contact {
    id: string
    lid?: string
    name?: string
    notify?: string
    verifiedName?: string
    imgUrl?: string | null
    status?: string
}

export interface ConnectionState {
    connection: WAConnectionState
    lastDisconnect?: {
        error: Error | undefined
        date: Date
    }
    isNewLogin?: boolean
    qr?: string
    receivedPendingNotifications?: boolean
    isOnline?: boolean
}

export type WAMessageContent = Proto.IMessage

export type WAMessageKey = Proto.IMessageKey & {
    senderLid?: string
    senderPn?: string
    participantLid?: string
    participantPn?: string
    isViewOnce?: boolean
}

export type WAMessage = Proto.IWebMessageInfo & { key: WAMessageKey }

export type WAMessageUpdate = { key: Proto.IMessageKey; update: Partial<WAMessage> }

export type MessageUpsertType = 'append' | 'notify'

export type MessageUserReceipt = Proto.IUserReceipt

export type MessageUserReceiptUpdate = {
    key: Proto.IMessageKey
    receipt: MessageUserReceipt
}

export type MessageReceiptType =
    | 'read'
    | 'read-self'
    | 'hist_sync'
    | 'peer_msg'
    | 'sender'
    | 'inactive'
    | 'played'
    | undefined

export type WAMediaPayloadURL = { url: URL | string }
export type WAMediaPayloadStream = { stream: NodeJS.ReadableStream }
export type WAMediaUpload = Uint8Array | WAMediaPayloadStream | WAMediaPayloadURL

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'ptv'

export interface DownloadableMessage {
    mediaKey?: Uint8Array | null
    directPath?: string | null
    url?: string | null
}

export interface WAUrlInfo {
    'canonical-url': string
    'matched-text': string
    title: string
    description?: string
    jpegThumbnail?: Uint8Array
    highQualityThumbnail?: Proto.Message.IImageMessage
    originalThumbnailUrl?: string
}

export interface Mentionable {
    mentions?: string[]
}

export interface Contextable {
    contextInfo?: Proto.IContextInfo
}

export interface Editable {
    edit?: WAMessageKey
}

export interface ViewOnce {
    viewOnce?: boolean
}

export interface WithDimensions {
    width?: number
    height?: number
}

export interface PollMessageOptions {
    name: string
    selectableCount?: number
    values: string[]
    messageSecret?: Uint8Array
    toAnnouncementGroup?: boolean
}

export type AnyMediaMessageContent = (
    | ({
          image: WAMediaUpload
          caption?: string
          jpegThumbnail?: string
      } & Mentionable &
          Contextable &
          WithDimensions)
    | ({
          video: WAMediaUpload
          caption?: string
          gifPlayback?: boolean
          jpegThumbnail?: string
          ptv?: boolean
      } & Mentionable &
          Contextable &
          WithDimensions)
    | {
          audio: WAMediaUpload
          ptt?: boolean
          seconds?: number
      }
    | ({
          sticker: WAMediaUpload
          isAnimated?: boolean
      } & WithDimensions)
    | ({
          document: WAMediaUpload
          mimetype: string
          fileName?: string
          caption?: string
      } & Contextable)
) & { mimetype?: string } & Editable

export type AnyRegularMessageContent = (
    | ({
          text: string
          linkPreview?: WAUrlInfo | null
      } & Mentionable &
          Contextable &
          Editable)
    | AnyMediaMessageContent
    | ({ poll: PollMessageOptions } & Mentionable & Contextable & Editable)
    | { contacts: { displayName?: string; contacts: Proto.Message.IContactMessage[] } }
    | { location: Proto.Message.ILocationMessage }
    | { react: Proto.Message.IReactionMessage }
    | { listReply: Omit<Proto.Message.IListResponseMessage, 'contextInfo'> }
    | {
          pin: WAMessageKey
          type: Proto.PinInChat.Type
          time?: 86_400 | 604_800 | 2_592_000
      }
    | { interactiveMessage: Proto.Message.IInteractiveMessage }
) &
    ViewOnce

export type AnyMessageContent =
    | AnyRegularMessageContent
    | { forward: WAMessage; force?: boolean }
    | { delete: WAMessageKey }
    | { disappearingMessagesInChat: boolean | number }

export interface MiscMessageGenerationOptions {
    /** override the generated stanza id */
    messageId?: string
    /** the message being replied to */
    quoted?: WAMessage
    /** disappearing-message expiration, in seconds */
    ephemeralExpiration?: number | string
    /** ack timeout for the send, in ms */
    mediaUploadTimeoutMs?: number
    /** mark the outgoing message as forwarded */
    broadcast?: boolean
    /** timestamp override, accepted for source compatibility (unused) */
    timestamp?: Date
    /** participant list for status@broadcast sends */
    statusJidList?: string[]
    /** use the cached group metadata, accepted for source compatibility (always on) */
    useCachedGroupMetadata?: boolean
}

export interface ParticipantUpdateResult {
    status: string
    jid: string
    lid?: string
    content?: unknown
}

export type ParticipantAction = 'add' | 'remove' | 'promote' | 'demote'

export type GroupSettingUpdate = 'announcement' | 'not_announcement' | 'locked' | 'unlocked'

export interface GroupParticipant {
    id: string
    lid?: string
    jid?: string
    isAdmin?: boolean
    isSuperAdmin?: boolean
    admin?: 'admin' | 'superadmin' | null
}

export interface GroupMetadata {
    id: string
    owner?: string
    subject: string
    subjectOwner?: string
    subjectTime?: number
    creation?: number
    desc?: string
    descOwner?: string
    descId?: string
    linkedParent?: string
    restrict?: boolean
    announce?: boolean
    isCommunity?: boolean
    isCommunityAnnounce?: boolean
    joinApprovalMode?: boolean
    memberAddMode?: boolean
    size?: number
    participants: GroupParticipant[]
    ephemeralDuration?: number
    inviteCode?: string
    addressingMode?: 'lid' | 'pn'
}

export interface PresenceData {
    lastKnownPresence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
    lastSeen?: number
}

export interface Chat {
    id: string
    name?: string
    conversationTimestamp?: number
    unreadCount?: number
    archived?: boolean
    pinned?: number
    muteEndTime?: number
    readOnly?: boolean
    ephemeralExpiration?: number
}

export type ChatUpdate = Partial<Chat> & { id: string }

export type ChatModification =
    | { archive: boolean; lastMessages: WAMessage[] }
    | { pin: boolean }
    | { mute: number | null }
    | { star: { messages: { id: string; fromMe?: boolean }[]; star: boolean } }
    | { markRead: boolean; lastMessages: WAMessage[] }
    | { clear: boolean }
    | { delete: true; lastMessages: { key: WAMessageKey; messageTimestamp?: number }[] }

export interface WACallEvent {
    chatId: string
    from: string
    id: string
    to?: string
    isVideo?: boolean
    isGroup?: boolean
    groupJid?: string
    date: Date
    offline: boolean
    latencyMs?: number
    status: 'offer' | 'ringing' | 'reject' | 'accept' | 'timeout' | 'terminate'
}

export interface OnWhatsAppResult {
    exists: boolean
    jid: string
    lid?: string
}

export interface BaileysEventMap {
    'connection.update': Partial<ConnectionState>
    'creds.update': Partial<AuthenticationCreds>
    'messaging-history.set': {
        chats: Chat[]
        contacts: Contact[]
        messages: WAMessage[]
        isLatest?: boolean
        progress?: number | null
        syncType?: number
        peerDataRequestSessionId?: string | null
    }
    'chats.upsert': Chat[]
    'chats.update': ChatUpdate[]
    'chats.delete': string[]
    'presence.update': { id: string; presences: { [participant: string]: PresenceData } }
    'contacts.upsert': Contact[]
    'contacts.update': Partial<Contact>[]
    'messages.delete': { keys: WAMessageKey[] } | { jid: string; all: true }
    'messages.update': WAMessageUpdate[]
    'messages.upsert': { messages: WAMessage[]; type: MessageUpsertType; requestId?: string }
    'messages.reaction': { key: WAMessageKey; reaction: Proto.IReaction }[]
    'message-receipt.update': MessageUserReceiptUpdate[]
    'groups.upsert': GroupMetadata[]
    'groups.update': Partial<GroupMetadata>[]
    'group-participants.update': {
        id: string
        author: string
        participants: string[]
        action: ParticipantAction
    }
    'blocklist.set': { blocklist: string[] }
    'blocklist.update': { blocklist: string[]; type: 'add' | 'remove' }
    call: WACallEvent[]
}

export type BaileysEvent = keyof BaileysEventMap

export interface BaileysEventEmitter {
    on<T extends BaileysEvent>(event: T, listener: (arg: BaileysEventMap[T]) => void): void
    off<T extends BaileysEvent>(event: T, listener: (arg: BaileysEventMap[T]) => void): void
    once<T extends BaileysEvent>(event: T, listener: (arg: BaileysEventMap[T]) => void): void
    removeAllListeners<T extends BaileysEvent>(event: T): void
    emit<T extends BaileysEvent>(event: T, arg: BaileysEventMap[T]): boolean
    /**
     * Upstream Baileys buffers events and hands them to a single handler.
     * The connector emits straight through, so this is a plain subscription
     * over the whole event map.
     */
    process(handler: (events: Partial<BaileysEventMap>) => void | Promise<void>): () => void
    /** No-op: the connector never buffers. Kept so upstream call sites compile. */
    buffer(): void
    /** No-op counterpart to {@link buffer}. Always resolves to `false`. */
    flush(): boolean
}

export type KeyPair = { public: Uint8Array; private: Uint8Array }

export type SignedKeyPair = {
    keyPair: KeyPair
    signature: Uint8Array
    keyId: number
    timestampS?: number
}

/**
 * Baileys-shaped credential view. The connector fills the fields it can read
 * back from the zapo-js credential record; the signal key material stays inside
 * the zapo-js store and is never mirrored here.
 *
 * @sensitive `noiseKey`, `signedIdentityKey`, `signedPreKey` and `advSecretKey`
 * carry private key material when populated. Never `JSON.stringify` or log an
 * instance, and encrypt it at rest if you persist it yourself.
 */
export interface AuthenticationCreds {
    me?: Contact
    account?: Proto.IADVSignedDeviceIdentity
    platform?: string
    registered: boolean
    registrationId?: number
    advSecretKey?: string
    noiseKey?: KeyPair
    signedIdentityKey?: KeyPair
    signedPreKey?: SignedKeyPair
    pairingCode?: string
    lastAccountSyncTimestamp?: number
}

export type SignalDataSet = Record<string, Record<string, unknown> | undefined>

export interface SignalKeyStore {
    get(type: string, ids: string[]): Promise<Record<string, unknown>>
    set(data: SignalDataSet): Promise<void>
    clear?(): Promise<void>
}

export interface AuthenticationState {
    creds: AuthenticationCreds
    keys: SignalKeyStore
}
