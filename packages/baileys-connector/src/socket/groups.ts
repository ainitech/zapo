import type { WaGroupMetadata, WaGroupParticipant } from 'zapo-js'

import type { GroupMetadata, GroupParticipant } from '../types'

function toParticipant(participant: WaGroupParticipant): GroupParticipant {
    const admin = participant.isSuperAdmin
        ? ('superadmin' as const)
        : participant.isAdmin
          ? ('admin' as const)
          : null
    return {
        id: participant.jid,
        lid: participant.lid,
        jid: participant.phoneNumber,
        isAdmin: participant.isAdmin,
        isSuperAdmin: participant.isSuperAdmin,
        admin
    }
}

/** Projects zapo-js group metadata onto the Baileys `GroupMetadata` shape. */
export function toGroupMetadata(metadata: WaGroupMetadata): GroupMetadata {
    return {
        id: metadata.jid,
        owner: metadata.owner,
        subject: metadata.subject,
        subjectOwner: metadata.subjectOwner,
        subjectTime: metadata.subjectTime,
        creation: metadata.creation,
        desc: metadata.desc,
        descOwner: metadata.descOwner,
        descId: metadata.descId,
        linkedParent: metadata.linkedParentJid,
        restrict: metadata.restrict,
        announce: metadata.announce,
        isCommunity: metadata.isParentGroup,
        isCommunityAnnounce: metadata.defaultSubgroup,
        joinApprovalMode: metadata.membershipApprovalEnabled,
        memberAddMode: metadata.memberAddMode === 'all_member_add',
        size: metadata.size ?? metadata.participants.length,
        participants: metadata.participants.map(toParticipant),
        ephemeralDuration: metadata.ephemeral,
        addressingMode: metadata.addressingMode
    }
}
