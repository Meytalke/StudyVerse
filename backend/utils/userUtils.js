const User = require('../models/User');

async function getUserFieldByCustomUserId(targetUserId, fieldToExtract) {
    try {
        console.log("I'm on getUserFieldByCustomUserId")
        if (!fieldToExtract || typeof fieldToExtract !== 'string') {
            console.error("getUserFieldByCustomUserId: 'fieldToExtract' must be a non-empty string.");
            return null;
        }

        const projection = {
            [fieldToExtract]: 1 
        };
        if (fieldToExtract !== '_id') {
            projection['_id'] = 0;
        }

        const user = await User.findOne({ user_id: targetUserId }).select(projection);

        if (user) {
            return user[fieldToExtract];
        } else {
            console.warn(`getUserFieldByCustomUserId: User not found for user_id: ${targetUserId}`);
            return null;
        }
    } catch (error) {
        console.error(`getUserFieldByCustomUserId: Error fetching field '${fieldToExtract}' for user_id '${targetUserId}':`, error);
        throw error;
    }
}

module.exports = {
    getUserFieldByCustomUserId
};