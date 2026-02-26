// electron/baileys/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.resolve(__dirname, './database');
const DB_PATH = path.join(DB_DIR, 'aurora_chat.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ════════════════════════════════════════════════════════════
// TABLES
// ════════════════════════════════════════════════════════════

db.exec(`
    -- Messages table with support for ALL WhatsApp message types
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        remote_jid TEXT NOT NULL,
        from_me INTEGER NOT NULL,
        participant TEXT,
        push_name TEXT,
        
        -- Message type detection
        message_type TEXT NOT NULL,
        
        -- Basic content (text, caption, etc)
        body TEXT,
        
        -- Full message JSON for complex types
        message_json TEXT,
        
        -- Media metadata
        media_mimetype TEXT,
        media_file_name TEXT,
        media_file_length INTEGER,
        media_duration INTEGER,
        media_height INTEGER,
        media_width INTEGER,
        media_caption TEXT,
        media_key TEXT,
        media_direct_path TEXT,
        media_url TEXT,
        media_sha256 TEXT,
        media_enc_sha256 TEXT,
        media_saved_path TEXT,
        media_is_downloaded INTEGER DEFAULT 0,
        
        -- Context info (reply, mentions, forwarding)
        context_stanza_id TEXT,
        context_participant TEXT,
        context_quoted_message TEXT,
        context_mentioned_jids TEXT, -- JSON array
        context_is_forwarded INTEGER,
        context_forwarding_score INTEGER,
        
        -- Reaction specific
        reaction_text TEXT,
        reaction_target_id TEXT,
        reaction_target_remote_jid TEXT,
        reaction_target_from_me INTEGER,
        
        -- Poll specific
        poll_name TEXT,
        poll_options TEXT, -- JSON array
        poll_selectable_count INTEGER,
        poll_votes TEXT, -- JSON array of votes
        
        -- Location specific
        location_lat REAL,
        location_lng REAL,
        location_name TEXT,
        location_address TEXT,
        location_accuracy INTEGER,
        
        -- Contact specific
        contact_vcard TEXT,
        contact_display_name TEXT,
        
        -- Group specific
        group_subject TEXT,
        group_description TEXT,
        group_participants TEXT, -- JSON array
        
        -- Ephemeral
        ephemeral_expiration INTEGER,
        ephemeral_setting_timestamp INTEGER,
        
        -- Protocol messages (delete, etc)
        protocol_type INTEGER,
        protocol_key_id TEXT,
        
        -- Status
        status INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0,
        broadcast INTEGER DEFAULT 0,
        
        -- Sync info
        is_history_sync INTEGER DEFAULT 0,
        sync_type TEXT,
        
        -- Timestamps
        message_timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_remote_jid ON messages(remote_jid);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(message_timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
    CREATE INDEX IF NOT EXISTS idx_messages_history_sync ON messages(is_history_sync);
    CREATE INDEX IF NOT EXISTS idx_messages_reaction_target ON messages(reaction_target_id);
    CREATE INDEX IF NOT EXISTS idx_messages_protocol ON messages(protocol_type);

    -- Chats table
    CREATE TABLE IF NOT EXISTS chats (
        jid TEXT PRIMARY KEY,
        name TEXT,
        is_group INTEGER DEFAULT 0,
        is_community INTEGER DEFAULT 0,
        unread_count INTEGER DEFAULT 0,
        last_message_timestamp INTEGER,
        last_message_id TEXT,
        last_message_body TEXT,
        pinned INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        muted_until INTEGER,
        profile_pic_url TEXT,
        status TEXT,
        presence TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_chats_timestamp ON chats(last_message_timestamp);
    CREATE INDEX IF NOT EXISTS idx_chats_pinned ON chats(pinned);

    -- Contacts table
    CREATE TABLE IF NOT EXISTS contacts (
        jid TEXT PRIMARY KEY,
        name TEXT,
        push_name TEXT,
        short_name TEXT,
        number TEXT,
        status TEXT,
        profile_pic_url TEXT,
        is_group INTEGER DEFAULT 0,
        is_user INTEGER DEFAULT 0,
        is_business INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Media downloads tracking
    CREATE TABLE IF NOT EXISTS media_downloads (
        message_id TEXT PRIMARY KEY,
        remote_jid TEXT NOT NULL,
        media_type TEXT NOT NULL,
        original_url TEXT,
        local_path TEXT,
        file_size INTEGER,
        download_status TEXT DEFAULT 'pending', -- pending, downloaded, failed, expired
        download_attempts INTEGER DEFAULT 0,
        error_message TEXT,
        downloaded_at DATETIME,
        FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    -- Poll votes tracking
    CREATE TABLE IF NOT EXISTS poll_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_message_id TEXT NOT NULL,
        voter_jid TEXT NOT NULL,
        selected_options TEXT, -- JSON array of option names
        timestamp INTEGER,
        FOREIGN KEY (poll_message_id) REFERENCES messages(id)
    );

    -- Message edits tracking
    CREATE TABLE IF NOT EXISTS message_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_message_id TEXT NOT NULL,
        edited_body TEXT,
        edited_timestamp INTEGER,
        FOREIGN KEY (original_message_id) REFERENCES messages(id)
    );

    -- Sync status tracking
    CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_syncing INTEGER DEFAULT 0,
        sync_started_at DATETIME,
        sync_completed_at DATETIME,
        total_chats INTEGER DEFAULT 0,
        total_messages INTEGER DEFAULT 0,
        last_sync_timestamp INTEGER
    );

    INSERT OR IGNORE INTO sync_status (id) VALUES (1);
`);

// ════════════════════════════════════════════════════════════
// PREPARED STATEMENTS
// ════════════════════════════════════════════════════════════

const statements = {
    // Messages
    insertMessage: db.prepare(`
        INSERT OR REPLACE INTO messages (
            id, remote_jid, from_me, participant, push_name, message_type, body,
            message_json, media_mimetype, media_file_name, media_file_length,
            media_duration, media_height, media_width, media_caption, media_key,
            media_direct_path, media_url, media_sha256, media_enc_sha256,
            context_stanza_id, context_participant, context_quoted_message,
            context_mentioned_jids, context_is_forwarded, context_forwarding_score,
            reaction_text, reaction_target_id, reaction_target_remote_jid, reaction_target_from_me,
            poll_name, poll_options, poll_selectable_count, poll_votes,
            location_lat, location_lng, location_name, location_address, location_accuracy,
            contact_vcard, contact_display_name,
            protocol_type, protocol_key_id,
            status, starred, broadcast, is_history_sync, sync_type,
            message_timestamp
        ) VALUES (
            @id, @remote_jid, @from_me, @participant, @push_name, @message_type, @body,
            @message_json, @media_mimetype, @media_file_name, @media_file_length,
            @media_duration, @media_height, @media_width, @media_caption, @media_key,
            @media_direct_path, @media_url, @media_sha256, @media_enc_sha256,
            @context_stanza_id, @context_participant, @context_quoted_message,
            @context_mentioned_jids, @context_is_forwarded, @context_forwarding_score,
            @reaction_text, @reaction_target_id, @reaction_target_remote_jid, @reaction_target_from_me,
            @poll_name, @poll_options, @poll_selectable_count, @poll_votes,
            @location_lat, @location_lng, @location_name, @location_address, @location_accuracy,
            @contact_vcard, @contact_display_name,
            @protocol_type, @protocol_key_id,
            @status, @starred, @broadcast, @is_history_sync, @sync_type,
            @message_timestamp
        )
    `),

    getMessageById: db.prepare('SELECT * FROM messages WHERE id = ?'),
    getMessagesByJid: db.prepare(`
        SELECT * FROM messages 
        WHERE remote_jid = ? 
        ORDER BY message_timestamp DESC 
        LIMIT @limit OFFSET @offset
    `),
    searchMessages: db.prepare(`
        SELECT * FROM messages 
        WHERE remote_jid = @jid AND body LIKE @query 
        ORDER BY message_timestamp DESC 
        LIMIT 100
    `),
    updateMessageStatus: db.prepare('UPDATE messages SET status = ? WHERE id = ?'),
    updateMessageStarred: db.prepare('UPDATE messages SET starred = ? WHERE id = ?'),
    deleteMessage: db.prepare('DELETE FROM messages WHERE id = ?'),
    getLastMessageByJid: db.prepare(`
        SELECT * FROM messages 
        WHERE remote_jid = ? 
        ORDER BY message_timestamp DESC 
        LIMIT 1
    `),

    // Chats
    insertChat: db.prepare(`
        INSERT OR REPLACE INTO chats (
            jid, name, is_group, is_community, unread_count,
            last_message_timestamp, last_message_id, last_message_body,
            pinned, archived, muted_until, profile_pic_url, status, presence
        ) VALUES (
            @jid, @name, @is_group, @is_community, @unread_count,
            @last_message_timestamp, @last_message_id, @last_message_body,
            @pinned, @archived, @muted_until, @profile_pic_url, @status, @presence
        )
    `),
    getChats: db.prepare(`
        SELECT * FROM chats 
        ORDER BY pinned DESC, last_message_timestamp DESC 
        LIMIT @limit OFFSET @offset
    `),
    getChatByJid: db.prepare('SELECT * FROM chats WHERE jid = ?'),
    updateChatUnread: db.prepare('UPDATE chats SET unread_count = ? WHERE jid = ?'),
    updateChatPinned: db.prepare('UPDATE chats SET pinned = ? WHERE jid = ?'),
    updateChatArchived: db.prepare('UPDATE chats SET archived = ? WHERE jid = ?'),
    updateChatLastMessage: db.prepare(`
        UPDATE chats SET 
            last_message_timestamp = @timestamp,
            last_message_id = @message_id,
            last_message_body = @body,
            unread_count = unread_count + 1
        WHERE jid = @jid
    `),

    // Contacts
    insertContact: db.prepare(`
        INSERT OR REPLACE INTO contacts (
            jid, name, push_name, short_name, number, status,
            profile_pic_url, is_group, is_user, is_business
        ) VALUES (
            @jid, @name, @push_name, @short_name, @number, @status,
            @profile_pic_url, @is_group, @is_user, @is_business
        )
    `),
    getContacts: db.prepare('SELECT * FROM contacts ORDER BY name LIMIT @limit OFFSET @offset'),
    searchContacts: db.prepare(`
        SELECT * FROM contacts 
        WHERE name LIKE @query OR push_name LIKE @query OR number LIKE @query
        LIMIT 50
    `),
    getContactByJid: db.prepare('SELECT * FROM contacts WHERE jid = ?'),

    // Media downloads
    insertMediaDownload: db.prepare(`
        INSERT OR REPLACE INTO media_downloads (
            message_id, remote_jid, media_type, original_url, download_status
        ) VALUES (@message_id, @remote_jid, @media_type, @original_url, @download_status)
    `),
    updateMediaDownload: db.prepare(`
        UPDATE media_downloads SET
            local_path = @local_path,
            file_size = @file_size,
            download_status = @download_status,
            download_attempts = download_attempts + 1,
            error_message = @error_message,
            downloaded_at = CURRENT_TIMESTAMP
        WHERE message_id = @message_id
    `),
    getPendingMediaDownloads: db.prepare(`
        SELECT * FROM media_downloads 
        WHERE download_status = 'pending' 
        ORDER BY download_attempts ASC 
        LIMIT 10
    `),

    // Sync status
    updateSyncStatus: db.prepare(`
        UPDATE sync_status SET
            is_syncing = @is_syncing,
            sync_started_at = @sync_started_at,
            sync_completed_at = @sync_completed_at,
            total_chats = @total_chats,
            total_messages = @total_messages,
            last_sync_timestamp = @last_sync_timestamp
        WHERE id = 1
    `),
    getSyncStatus: db.prepare('SELECT * FROM sync_status WHERE id = 1'),

    // Stats
    getStats: db.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM messages) as total_messages,
            (SELECT COUNT(*) FROM chats) as total_chats,
            (SELECT COUNT(*) FROM contacts) as total_contacts,
            (SELECT COUNT(*) FROM messages WHERE is_history_sync = 1) as history_messages,
            (SELECT COUNT(*) FROM messages WHERE media_is_downloaded = 1) as downloaded_media,
            (SELECT COUNT(*) FROM media_downloads WHERE download_status = 'pending') as pending_downloads
    `)
};

// ════════════════════════════════════════════════════════════
// MESSAGE TYPE DETECTOR
// ════════════════════════════════════════════════════════════

function detectMessageType(message) {
    if (!message) return 'unknown';

    // Check for ephemeral wrapper
    if (message.ephemeralMessage) {
        return 'ephemeral';
    }

    // Check for view once wrapper
    if (message.viewOnceMessage || message.viewOnceMessageV2) {
        return 'view_once';
    }

    // Check for edited message wrapper
    if (message.editedMessage) {
        return 'edited';
    }

    // Protocol messages (delete, etc)
    if (message.protocolMessage) {
        return 'protocol';
    }

    // Direct message types
    const types = [
        'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage',
        'audioMessage', 'documentMessage', 'stickerMessage', 'locationMessage',
        'liveLocationMessage', 'contactMessage', 'contactsArrayMessage',
        'reactionMessage', 'pollCreationMessage', 'pollUpdateMessage',
        'groupInviteMessage', 'paymentMessage', 'orderMessage', 'productMessage',
        'eventMessage', 'callMessage', 'buttonsMessage', 'buttonsResponseMessage',
        'listMessage', 'listResponseMessage', 'interactiveMessage', 'carouselMessage',
        'albumMessage', 'pollResultMessage', 'sharePhoneNumberMessage',
        'requestPhoneNumberMessage', 'adminInviteMessage', 'paymentInviteMessage',
        'pinInChatMessage', 'keepInChatMessage', 'ptvMessage'
    ];

    for (const type of types) {
        if (message[type]) return type.replace('Message', '').toLowerCase();
    }

    return 'unknown';
}

// ════════════════════════════════════════════════════════════
// CONTENT EXTRACTOR
// ════════════════════════════════════════════════════════════

function extractContent(message, type) {
    const result = {
        body: '',
        media: null,
        context: null,
        reaction: null,
        poll: null,
        location: null,
        contact: null,
        protocol: null
    };

    // Handle wrappers
    let actualMessage = message;
    if (type === 'ephemeral' && message.ephemeralMessage) {
        actualMessage = message.ephemeralMessage.message;
        type = detectMessageType(actualMessage);
    }
    if (type === 'view_once' && (message.viewOnceMessage || message.viewOnceMessageV2)) {
        actualMessage = message.viewOnceMessage?.message || message.viewOnceMessageV2?.message;
        type = detectMessageType(actualMessage);
    }
    if (type === 'edited' && message.editedMessage) {
        actualMessage = message.editedMessage.message;
        type = detectMessageType(actualMessage);
    }

    const msg = actualMessage;

    // Extract body/text
    switch (type) {
        case 'conversation':
            result.body = msg.conversation || '';
            break;
        case 'extendedText':
            result.body = msg.extendedTextMessage?.text || '';
            result.context = extractContextInfo(msg.extendedTextMessage?.contextInfo);
            break;
        case 'image':
            result.body = msg.imageMessage?.caption || '';
            result.media = extractMediaInfo(msg.imageMessage, 'image');
            result.context = extractContextInfo(msg.imageMessage?.contextInfo);
            break;
        case 'video':
            result.body = msg.videoMessage?.caption || '';
            result.media = extractMediaInfo(msg.videoMessage, 'video');
            result.context = extractContextInfo(msg.videoMessage?.contextInfo);
            break;
        case 'audio':
            result.body = msg.audioMessage?.caption || '';
            result.media = extractMediaInfo(msg.audioMessage, 'audio');
            break;
        case 'document':
            result.body = msg.documentMessage?.caption || '';
            result.media = extractMediaInfo(msg.documentMessage, 'document');
            result.context = extractContextInfo(msg.documentMessage?.contextInfo);
            break;
        case 'sticker':
            result.media = extractMediaInfo(msg.stickerMessage, 'sticker');
            break;
        case 'location':
            result.location = {
                lat: msg.locationMessage?.degreesLatitude,
                lng: msg.locationMessage?.degreesLongitude,
                name: msg.locationMessage?.name,
                address: msg.locationMessage?.address
            };
            break;
        case 'liveLocation':
            result.location = {
                lat: msg.liveLocationMessage?.degreesLatitude,
                lng: msg.liveLocationMessage?.degreesLongitude,
                accuracy: msg.liveLocationMessage?.accuracyInMeters,
                speed: msg.liveLocationMessage?.speedInMps
            };
            break;
        case 'contact':
            result.contact = {
                displayName: msg.contactMessage?.displayName,
                vcard: msg.contactMessage?.vcard
            };
            break;
        case 'reaction':
            result.reaction = {
                text: msg.reactionMessage?.text,
                targetId: msg.reactionMessage?.key?.id,
                targetRemoteJid: msg.reactionMessage?.key?.remoteJid,
                targetFromMe: msg.reactionMessage?.key?.fromMe
            };
            break;
        case 'pollCreation':
            result.poll = {
                name: msg.pollCreationMessage?.name,
                options: msg.pollCreationMessage?.options?.map(o => o.optionName) || [],
                selectableCount: msg.pollCreationMessage?.selectableOptionsCount
            };
            break;
        case 'protocol':
            result.protocol = {
                type: msg.protocolMessage?.type,
                keyId: msg.protocolMessage?.key?.id
            };
            break;
        case 'groupInvite':
            result.body = msg.groupInviteMessage?.caption || '';
            break;
        case 'payment':
            result.body = `Payment: ${msg.paymentMessage?.amount} ${msg.paymentMessage?.currency}`;
            break;
        case 'order':
            result.body = `Order: ${msg.orderMessage?.orderTitle}`;
            break;
        case 'event':
            result.body = `Event: ${msg.eventMessage?.name}`;
            break;
        case 'buttons':
            result.body = msg.buttonsMessage?.text || '';
            break;
        case 'list':
            result.body = msg.listMessage?.title || '';
            break;
        case 'ptv':
            result.media = extractMediaInfo(msg.ptvMessage, 'video');
            break;
    }

    return result;
}

function extractMediaInfo(mediaObj, type) {
    if (!mediaObj) return null;

    return {
        mimetype: mediaObj.mimetype,
        fileName: mediaObj.fileName,
        fileLength: mediaObj.fileLength,
        duration: mediaObj.seconds,
        height: mediaObj.height,
        width: mediaObj.width,
        caption: mediaObj.caption,
        mediaKey: mediaObj.mediaKey,
        directPath: mediaObj.directPath,
        url: mediaObj.url,
        sha256: mediaObj.fileSha256,
        encSha256: mediaObj.fileEncSha256,
        ptt: mediaObj.ptt // For audio
    };
}

function extractContextInfo(contextInfo) {
    if (!contextInfo) return null;

    return {
        stanzaId: contextInfo.stanzaId,
        participant: contextInfo.participant,
        quotedMessage: contextInfo.quotedMessage ? JSON.stringify(contextInfo.quotedMessage) : null,
        mentionedJids: contextInfo.mentionedJid ? JSON.stringify(contextInfo.mentionedJid) : null,
        isForwarded: contextInfo.isForwarded,
        forwardingScore: contextInfo.forwardingScore
    };
}

// ════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ════════════════════════════════════════════════════════════

const database = {
    // Messages
    saveMessage: (msg, isHistorySync = false, syncType = null) => {
        try {
            const type = detectMessageType(msg.message);
            const content = extractContent(msg.message, type);

            const params = {
                id: msg.key.id,
                remote_jid: msg.key.remoteJid,
                from_me: msg.key.fromMe ? 1 : 0,
                participant: msg.participant || null,
                push_name: msg.pushName || null,
                message_type: type,
                body: content.body,
                message_json: JSON.stringify(msg.message),

                // Media
                media_mimetype: content.media?.mimetype || null,
                media_file_name: content.media?.fileName || null,
                media_file_length: content.media?.fileLength || null,
                media_duration: content.media?.duration || null,
                media_height: content.media?.height || null,
                media_width: content.media?.width || null,
                media_caption: content.media?.caption || null,
                media_key: content.media?.mediaKey ? Buffer.from(content.media.mediaKey).toString('base64') : null,
                media_direct_path: content.media?.directPath || null,
                media_url: content.media?.url || null,
                media_sha256: content.media?.sha256 ? Buffer.from(content.media.sha256).toString('base64') : null,
                media_enc_sha256: content.media?.encSha256 ? Buffer.from(content.media.encSha256).toString('base64') : null,

                // Context
                context_stanza_id: content.context?.stanzaId || null,
                context_participant: content.context?.participant || null,
                context_quoted_message: content.context?.quotedMessage || null,
                context_mentioned_jids: content.context?.mentionedJids || null,
                context_is_forwarded: content.context?.isForwarded ? 1 : 0,
                context_forwarding_score: content.context?.forwardingScore || 0,

                // Reaction
                reaction_text: content.reaction?.text || null,
                reaction_target_id: content.reaction?.targetId || null,
                reaction_target_remote_jid: content.reaction?.targetRemoteJid || null,
                reaction_target_from_me: content.reaction?.targetFromMe ? 1 : 0,

                // Poll
                poll_name: content.poll?.name || null,
                poll_options: content.poll?.options ? JSON.stringify(content.poll.options) : null,
                poll_selectable_count: content.poll?.selectableCount || null,
                poll_votes: null, // Will be updated when votes come in

                // Location
                location_lat: content.location?.lat || null,
                location_lng: content.location?.lng || null,
                location_name: content.location?.name || null,
                location_address: content.location?.address || null,
                location_accuracy: content.location?.accuracy || null,

                // Contact
                contact_vcard: content.contact?.vcard || null,
                contact_display_name: content.contact?.displayName || null,

                // Protocol
                protocol_type: content.protocol?.type || null,
                protocol_key_id: content.protocol?.keyId || null,

                // Status
                status: msg.status || 0,
                starred: msg.starred ? 1 : 0,
                broadcast: msg.broadcast ? 1 : 0,

                // Sync
                is_history_sync: isHistorySync ? 1 : 0,
                sync_type: syncType,

                message_timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000)
            };

            statements.insertMessage.run(params);

            // Update chat last message
            if (!isHistorySync) {
                statements.updateChatLastMessage.run({
                    jid: msg.key.remoteJid,
                    timestamp: params.message_timestamp,
                    message_id: msg.key.id,
                    body: params.body || `[${type}]`
                });
            }

            return { success: true, type, hasMedia: !!content.media };
        } catch (error) {
            console.error('Error saving message:', error);
            return { success: false, error: error.message };
        }
    },

    getMessages: (jid, limit = 50, offset = 0) => {
        return statements.getMessagesByJid.all(jid, { limit, offset });
    },

    searchMessages: (jid, query) => {
        return statements.searchMessages.all({ jid, query: `%${query}%` });
    },

    updateMessageStatus: (id, status) => {
        statements.updateMessageStatus.run(status, id);
    },

    // Chats
    saveChat: (chat) => {
        try {
            statements.insertChat.run({
                jid: chat.id,
                name: chat.name || chat.subject || null,
                is_group: chat.isGroup ? 1 : 0,
                is_community: chat.isCommunity ? 1 : 0,
                unread_count: chat.unreadCount || 0,
                last_message_timestamp: chat.lastMessageTimestamp || null,
                last_message_id: chat.lastMessageKey?.id || null,
                last_message_body: null, // Will be updated when message saved
                pinned: chat.pinned ? 1 : 0,
                archived: chat.archived ? 1 : 0,
                muted_until: chat.muteEndTime || null,
                profile_pic_url: chat.profilePicUrl || null,
                status: chat.status || null,
                presence: chat.presence || null
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving chat:', error);
            return { success: false, error: error.message };
        }
    },

    getChats: (limit = 50, offset = 0) => {
        return statements.getChats.all({ limit, offset });
    },

    updateChatRead: (jid) => {
        statements.updateChatUnread.run(0, jid);
    },

    updateChatPinned: (jid, pinned) => {
        statements.updateChatPinned.run(pinned ? 1 : 0, jid);
    },

    updateChatArchived: (jid, archived) => {
        statements.updateChatArchived.run(archived ? 1 : 0, jid);
    },

    // Contacts
    saveContact: (contact) => {
        try {
            statements.insertContact.run({
                jid: contact.id,
                name: contact.name || null,
                push_name: contact.pushname || null,
                short_name: contact.shortName || null,
                number: contact.number || contact.id.split('@')[0],
                status: contact.status || null,
                profile_pic_url: contact.profilePicUrl || null,
                is_group: contact.isGroup ? 1 : 0,
                is_user: contact.isUser ? 1 : 0,
                is_business: contact.isBusiness ? 1 : 0
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving contact:', error);
            return { success: false, error: error.message };
        }
    },

    saveContacts: (contacts) => {
        const insert = db.transaction((contacts) => {
            for (const contact of contacts) {
                database.saveContact(contact);
            }
        });
        insert(contacts);
    },

    getContacts: (limit = 100, offset = 0) => {
        return statements.getContacts.all({ limit, offset });
    },

    searchContacts: (query) => {
        return statements.searchContacts.all({ query: `%${query}%` });
    },

    // Media
    queueMediaDownload: (messageId, remoteJid, mediaType, url) => {
        try {
            statements.insertMediaDownload.run({
                message_id: messageId,
                remote_jid: remoteJid,
                media_type: mediaType,
                original_url: url,
                download_status: 'pending'
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    updateMediaDownload: (messageId, localPath, fileSize, status, errorMessage = null) => {
        statements.updateMediaDownload.run({
            message_id: messageId,
            local_path: localPath,
            file_size: fileSize,
            download_status: status,
            error_message: errorMessage
        });
    },

    getPendingMediaDownloads: () => {
        return statements.getPendingMediaDownloads.all();
    },

    // Sync status
    startSync: () => {
        statements.updateSyncStatus.run({
            is_syncing: 1,
            sync_started_at: new Date().toISOString(),
            sync_completed_at: null,
            total_chats: 0,
            total_messages: 0,
            last_sync_timestamp: null
        });
    },

    endSync: (totalChats, totalMessages) => {
        statements.updateSyncStatus.run({
            is_syncing: 0,
            sync_started_at: null,
            sync_completed_at: new Date().toISOString(),
            total_chats: totalChats,
            total_messages: totalMessages,
            last_sync_timestamp: Math.floor(Date.now() / 1000)
        });
    },

    getSyncStatus: () => {
        return statements.getSyncStatus.get();
    },

    // Stats
    getStats: () => {
        return statements.getStats.get();
    },

    // Close
    close: () => {
        db.close();
    }
};

module.exports = database;