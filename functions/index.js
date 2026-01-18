const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();


const ADMIN_EMAIL = 'support@proxtrades.com';

/**
 * Triggered when a new report is created
 * Sends email notification when an event reaches 3 reports
 */
exports.onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const eventId = report.eventId;
    
    // Count total reports for this event
    const reportsSnapshot = await db
      .collection('reports')
      .where('eventId', '==', eventId)
      .get();
    
    const reportCount = reportsSnapshot.size;
    
    console.log(`Event ${eventId} now has ${reportCount} reports`);
    
    // Send notification at threshold
    if (reportCount === 3) {
      await sendThresholdNotification(report, reportCount);
    } else if (reportCount === 5) {
      await sendUrgentNotification(report, reportCount);
    }
    
    return null;
  });

/**
 * Send notification when event hits 3 reports
 */
async function sendThresholdNotification(report, count) {
  const notification = {
    to: ADMIN_EMAIL,
    message: {
      subject: `⚠️ EventSwipe: Event flagged ${count} times`,
      html: `
        <h2>Event Report Alert</h2>
        <p>An event has been reported <strong>${count} times</strong> and needs review.</p>
        
        <h3>Event Details:</h3>
        <ul>
          <li><strong>Title:</strong> ${report.eventTitle || 'Unknown'}</li>
          <li><strong>Event ID:</strong> ${report.eventId}</li>
          <li><strong>Date:</strong> ${report.eventDate || 'N/A'}</li>
          <li><strong>Location:</strong> ${report.eventLocation || 'N/A'}</li>
          <li><strong>Source:</strong> ${report.eventSource || 'N/A'}</li>
        </ul>
        
        <h3>Latest Report:</h3>
        <ul>
          <li><strong>Reason:</strong> ${report.reason}</li>
          <li><strong>Details:</strong> ${report.details || 'None provided'}</li>
        </ul>
        
        <p><a href="https://console.firebase.google.com/project/YOUR_PROJECT_ID/firestore/data/~2Freports">
          View in Firebase Console
        </a></p>
      `,
    },
  };
  
  // Save to 'mail' collection - requires Firebase Trigger Email extension
  await db.collection('mail').add(notification);
  
  console.log(`Sent threshold notification for event: ${report.eventTitle}`);
}

/**
 * Send urgent notification when event hits 5 reports (auto-removed)
 */
async function sendUrgentNotification(report, count) {
  const notification = {
    to: ADMIN_EMAIL,
    message: {
      subject: `🚨 EventSwipe: Event AUTO-REMOVED (${count} reports)`,
      html: `
        <h2>Event Auto-Removed</h2>
        <p>An event has been <strong>automatically removed</strong> after receiving ${count} reports.</p>
        
        <h3>Event Details:</h3>
        <ul>
          <li><strong>Title:</strong> ${report.eventTitle || 'Unknown'}</li>
          <li><strong>Event ID:</strong> ${report.eventId}</li>
          <li><strong>Date:</strong> ${report.eventDate || 'N/A'}</li>
          <li><strong>Location:</strong> ${report.eventLocation || 'N/A'}</li>
          <li><strong>Source:</strong> ${report.eventSource || 'N/A'}</li>
        </ul>
        
        <p>The event has been hidden from users. Review the reports and take further action if needed.</p>
        
        <p><a href="https://console.firebase.google.com/project/YOUR_PROJECT_ID/firestore/data/~2Freports">
          View in Firebase Console
        </a></p>
      `,
    },
  };
  
  await db.collection('mail').add(notification);
  
  console.log(`Sent urgent notification for auto-removed event: ${report.eventTitle}`);
}
