/* Internal only (plain backend module). The recipient is always decided by
   backend/venueInquiry.jsw from the venue's data, never by a browser. */
import { triggeredEmails } from 'wix-crm-backend';
import wixData from 'wix-data';

import { SITE_URL } from 'backend/config';

export async function sendRequestEmail(ownerEmail, data) {
    // Look up the member ID by email
    const memberRes = await wixData.query('Members/PrivateMembersData')
        .eq('loginEmail', ownerEmail)
        .find({ suppressAuth: true });

    if (memberRes.items.length === 0) {
        console.warn('No member found for email:', ownerEmail);
        return;
    }

    const memberId = memberRes.items[0]._id;

    await triggeredEmails.emailMember('requestAvailability', memberId, {
        variables: {
            venueName:      data.venueName,
            guestName:      data.name,
            guestEmail:     data.email,
            guestPhone:     data.phone,
            numberOfGuests: data.numberOfGuests,
            suitableDates:  data.suitableDates.join(', '),
            SITE_URL:       SITE_URL,
        }
    });
}
