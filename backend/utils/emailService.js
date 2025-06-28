const config = require('../config/config');
const nodemailer = require("nodemailer");
const { getUserFieldByCustomUserId } = require('./userUtils');

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: config.EMAIL_USERNAME,
    pass: config.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false 
  }
});

exports.sendVerificationEmail = async (to, token) => {
  const frontendBaseUrl = 'http://localhost:3000';
  const verificationUrl = `${frontendBaseUrl}/verify-email/${token}`;

  const mailOptions = {
    from: '"StudyVerse" <studyversem@gmail.com>',
    to,
    subject: "Verify your email address",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Welcome to Study Verse!</h2>
        <p>Thank you for registering. Please click the button below to verify your email address:</p>
        <a href="${verificationUrl}" style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 5px;
        ">Verify Email</a>
        <p style="margin-top: 20px;">Or copy and paste this URL into your browser:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <hr />
        <p style="font-size: 0.9em; color: #888;">If you did not request this email, you can ignore it.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email verification sent to ${to}`);
  } catch (error) {
    console.error('Error sending verification email:', error);
  }
};

exports.sendResetPasswordEmail = async (to, token) => {
  const frontendBaseUrl = 'http://localhost:3000';
  const resetUrl = `${frontendBaseUrl}/reset-password/${token}`;

  const mailOptions = {
    from: `"StudyVerse Password Reset" <${config.EMAIL_FROM || 'studyversem@gmail.com'}>`,
    to,
    subject: "Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Password Reset Request</h2>
        <p>You are receiving this email because you (or someone else) have requested the reset of a password for your account.</p>
        <p>Please click on the following link, or paste this into your browser to complete the process within one hour of receiving it:</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #007bff;
          color: white;
          text-decoration: none;
          border-radius: 5px;
        ">Reset Password</a>
        <p style="margin-top: 20px;">Or copy and paste this URL into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <hr />
        <p style="font-size: 0.9em; color: #888;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${to}`);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};


exports.sendGroupJoinConfirmationEmail = async (to, groupName, groupId) => {
    const frontendBaseUrl = 'http://localhost:3000';
    const groupUrl = `${frontendBaseUrl}/groups/${groupId}/dashboard`; 

    const mailOptions = {
        from: `"StudyVerse" <studyversem@gmail.com>`,
        to,
        subject: `Welcome to the ${groupName} Group on StudyVerse!`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>Welcome to ${groupName} Group!</h2>
                <p>Hi there,</p>
                <p>You have successfully joined the <strong>${groupName}</strong> group on StudyVerse!</p>
                <p>This is a great place to connect with others, share knowledge, and collaborate on your studies.</p>
                <p>Ready to get started? Click the button below to visit your new group and explore the discussions:</p>
                <a href="${groupUrl}" style="
                    display: inline-block;
                    padding: 10px 20px;
                    background-color: #28a745; /* Green for success/join */
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                ">Go to Group</a>
                <p style="margin-top: 20px;">Or copy and paste this URL into your browser:</p>
                <p><a href="${groupUrl}">${groupUrl}</a></p>
                <hr />
                <p style="font-size: 0.9em; color: #888;">Happy studying!</p>
                <p style="font-size: 0.9em; color: #888;">The StudyVerse Team</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Group join confirmation sent to ${to} for group ${groupName}`);
    } catch (error) {
        console.error(`Error sending group join confirmation email for ${groupName}:`, error);
    }
};

exports.sendCommentNotificationEmail = async (to, commenterName, postTitle, postId, commentContent, groupId = null, groupName = null) => {
    const frontendBaseUrl = 'http://localhost:3000';
    const postUrl = `${frontendBaseUrl}//posts/${postId}`

    const mailOptions = {
        from: `"StudyVerse" <studyversem@gmail.com>`,
        to,
        subject: `${commenterName} commented on your post: "${postTitle}"`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>New Comment on Your Post!</h2>
                <p>Hi there,</p>
                <p><strong>${commenterName}</strong> just commented on your post titled:</p>
                <p style="font-style: italic; background-color: #f0f0f0; padding: 10px; border-left: 3px solid #007bff; border-radius: 3px;">"${postTitle}"</p>
                <p>Their comment:</p>
                <div style="background-color: #e6f7ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #cceeff;">
                    <p style="margin: 0; font-size: 1.1em; color: #0056b3;">${commentContent}</p>
                </div>
                <p>Click the button below to view the comment and join the conversation:</p>
                <a href="${postUrl}" style="
                    display: inline-block;
                    padding: 10px 20px;
                    background-color: #007bff; /* Blue for view/action */
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                ">View Post</a>
                <p style="margin-top: 20px;">Or copy and paste this URL into your browser:</p>
                <p><a href="${postUrl}">${postUrl}</a></p>
                <hr />
                <p style="font-size: 0.9em; color: #888;">See you on StudyVerse!</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Comment notification sent to ${to} for post ${postId}`);
    } catch (error) {
        console.error(`Error sending comment notification email for post ${postId}:`, error);
    }
};

exports.sendLikeNotificationEmail = async (toEmail, likerUserId, targetType, targetId, targetTitle, postIdIfComment = null) => {
    const frontendBaseUrl = 'http://localhost:3000';

    let subject = "";
    let htmlContent = "";
    let targetUrl = "";
    let likerName = "Someone"; // defualt

    try {
        const foundLikerName = await getUserFieldByCustomUserId(likerUserId, 'username');
        if (foundLikerName) {
            likerName = foundLikerName;
        }

        if (targetType === 'post') {
            targetUrl = `${frontendBaseUrl}/posts/${targetId}`;
            subject = `${likerName} liked your post: "${targetTitle}"`;
            htmlContent = `
                <h2>Someone Liked Your Post!</h2>
                <p>Hi there,</p>
                <p>Great news! <strong>${likerName}</strong> just liked your post titled:</p>
                <p style="font-style: italic; background-color: #f9f9f9; padding: 10px; border-left: 3px solid #ffc107; border-radius: 3px;">"${targetTitle}"</p>
                <p>It's always great to know your contributions are appreciated!</p>
            `;
        } else if (targetType === 'comment') {
            if (!postIdIfComment) {
                console.warn(`sendLikeNotificationEmail: Missing postIdIfComment for comment like notification. Cannot generate URL.`);
                return; 
            }
            targetUrl = `${frontendBaseUrl}/posts/${postIdIfComment}`; 
            subject = `${likerName} liked your comment`;
            htmlContent = `
                <h2>Someone Liked Your Comment!</h2>
                <p>Hi there,</p>
                <p>Great news! <strong>${likerName}</strong> just liked your comment:</p>
                <p style="font-style: italic; background-color: #f9f9f9; padding: 10px; border-left: 3px solid #ffc107; border-radius: 3px;">"${targetTitle}"</p>
                <p>It's always great to know your contributions are appreciated!</p>
            `;
        } else {
            console.error(`sendLikeNotificationEmail: Invalid targetType received: ${targetType}`);
            return; 
        }

        const mailOptions = {
            from: `"StudyVerse" <studyversem@gmail.com>`,
            to: toEmail,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    ${htmlContent}
                    <p>Click the button below to see ${targetType === 'post' ? 'your post' : 'the post with your comment'}:</p>
                    <a href="${targetUrl}" style="
                        display: inline-block;
                        padding: 10px 20px;
                        background-color: #ffc107; /* Orange for positive feedback */
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                    ">View ${targetType === 'post' ? 'Post' : 'Discussion'}</a>
                    <p style="margin-top: 20px;">Or copy and paste this URL into your browser:</p>
                    <p><a href="${targetUrl}">${targetUrl}</a></p>
                    <hr />
                    <p style="font-size: 0.9em; color: #888;">Keep up the great work on StudyVerse!</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Like notification sent to ${toEmail} for ${targetType} ${targetId} by ${likerName}`);
    } catch (error) {
        console.error(`Error sending like notification email for ${targetType} ${targetId}:`, error);
    }
};

exports.sendNewChatMessageNotificationEmail = async (to, senderName, messageContent) => {
    console.log("i'm on sendNewChatMessageNotificationEmail")
    const frontendBaseUrl = 'http://localhost:3000';
    const chatUrl = `${frontendBaseUrl}/chat`; 

    const mailOptions = {
        from: `"StudyVerse Chat" <studyversem@gmail.com>`,
        to,
        subject: `New message from ${senderName} on StudyVerse`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>You have a new message!</h2>
                <p>Hi there,</p>
                <p><strong>${senderName}</strong> sent you a new message:</p>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #e9ecef;">
                    <p style="margin: 0; font-size: 1.1em; color: #343a40;">"${messageContent}"</p>
                </div>
                <p>Click the button below to reply:</p>
                <a href="${chatUrl}" style="
                    display: inline-block;
                    padding: 10px 20px;
                    background-color: #6c757d; /* Grey/neutral for chat */
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                ">View Message</a>
                <p style="margin-top: 20px;">Or copy and paste this URL into your browser:</p>
                <p><a href="${chatUrl}">${chatUrl}</a></p>
                <hr />
                <p style="font-size: 0.9em; color: #888;">The StudyVerse Team</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`New chat message notification sent to ${to} from ${senderName}`);
    } catch (error) {
        console.error(`Error sending new chat message notification email from ${senderName}:`, error);
    }
};