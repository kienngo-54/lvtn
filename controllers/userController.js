const { ObjectId} = require('mongodb');

const axios = require('axios');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const Team= require('../models/team');
const Field = require('../models/field');
const Booking = require('../models/booking');
const Equipment = require('../models/equipment');
const Matching = require('../models/matching');
const jwt= require('jsonwebtoken');
const { connectToDB } = require('../utils/db');
require('dotenv').config();
async function registerUser(req, res) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({
        ec: 1, 
        msg: 'Thông tin người dùng không hợp lệ',
      });
    }
    const db= await connectToDB();
    const usersCollection = db.collection('users');
    
    // Sử dụng unique index trên trường email để tối ưu tìm kiếm và tránh trùng lặp
    const existingUser = await usersCollection.findOne({ email });

    // Kiểm tra nếu người dùng đã tồn tại
    if (existingUser) {
      return res.status(400).json({
        ec: 1,  
        msg: 'Người dùng đã tồn tại',
      });
    }

    // Hash password và tạo người dùng mới
    const salt = await bcrypt.genSalt(8);  // Sử dụng số salt rounds hợp lý
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo đối tượng người dùng mới
    const user = { username, email, salt, hashedPassword, role: 'user' };
    const result = await usersCollection.insertOne(user);

    // Trả về kết quả thành công
    return res.json({
      ec: 0,  // Thành công
      total: 1,  // Tổng số kết quả trả về (1 người dùng)
      data: { userId: result.insertedId },  // Dữ liệu trả về chứa ID người dùng mới
      msg: 'Tạo người dùng thành công',
    });
  } catch (err) {
    console.error('Lỗi khi tạo người dùng:', err);
    return res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi tạo người dùng',
    });
  }
}
async function loginUser(req, res) {
  try {
    const db= await connectToDB();
    const { email, password } = req.body;

    // Kiểm tra nếu không có email hoặc password
    if (!email || !password) {
      return res.status(400).json({
        ec: 1,  // Lỗi thông tin đăng nhập
        msg: 'Thông tin đăng nhập không hợp lệ',
      });
    }

    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email });

    // Kiểm tra nếu không tìm thấy người dùng
    if (!user) {
      return res.status(401).json({
        ec: 1,  // Lỗi email hoặc mật khẩu không đúng
        msg: 'Email hoặc mật khẩu không đúng',
      });
    }

    // Kiểm tra mật khẩu
    const isValidPassword = await bcrypt.compare(password, user.hashedPassword);
    if (!isValidPassword) {
      return res.status(401).json({
        ec: 1,  // Lỗi email hoặc mật khẩu không đúng
        msg: 'Email hoặc mật khẩu không đúng',
      });
    }

    // Tạo token cho người dùng
    const token = jwt.sign({ userId: user._id, email: user.email, role: user.role }, process.env.SECRET_KEY, {
      expiresIn: '200h',
    });

    // Trả về thông tin thành công và token
    return res.json({
      ec: 0,  // Thành công
      total: 1,
      data: { token, userId: user._id,username: user.username ,email: user.email, role: user.role },
      msg: 'Đăng nhập thành công',
    });
  } catch (err) {
    console.error('Lỗi khi đăng nhập người dùng:', err);

    // Trả về lỗi server
    return res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi đăng nhập người dùng',
    });
  }
}
async function getUserInfo(req, res) {
  try {
    const db= await connectToDB();
    const userId = req.user.userId;  // Lấy userId từ JWT token

    const usersCollection = db.collection('users');
    const objectId = ObjectId.createFromHexString(userId);

    // Tìm người dùng theo userId
    const user = await usersCollection.findOne({ _id: objectId });

    // Nếu không tìm thấy người dùng
    if (!user) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Không tìm thấy người dùng
        msg: 'Người dùng không tồn tại',
      });
    }
    const { hashedPassword, salt, ...userInfo } = user;

    // Trả về thông tin người dùng
    res.status(200).json({
      ec: 0,  // Thành công
      total: 1,
      data: userInfo,
      msg: 'Lấy thông tin người dùng thành công',
    });
  } catch (err) {
    console.error('Lỗi lấy thông tin người dùng:', err);

    // Trả về lỗi server
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi lấy thông tin người dùng',
    });
  }
}
async function addOrUpdateAddress(req, res) {
  try {
    const db= await connectToDB();
    const { address } = req.body;
    const userId = req.user.userId; // Lấy userId từ JWT token

    if (!address) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Địa chỉ không hợp lệ
        msg: 'Địa chỉ không được để trống',
      });
    }

    const usersCollection = db.collection('users');
    const objectId = ObjectId.createFromHexString(userId);

    // Tìm người dùng hiện tại
    const user = await usersCollection.findOne({ _id: objectId });

    if (!user) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Người dùng không tồn tại
        msg: 'Không tìm thấy người dùng',
      });
    }

    // Cập nhật hoặc thêm địa chỉ
    const update = { $set: { address: address } };

    const result = await usersCollection.updateOne(
      { _id: objectId },
      update
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Cập nhật không thành công
        msg: 'Cập nhật địa chỉ không thành công',
      });
    }

    // Trả về kết quả thành công
    res.json({
      ec: 0,  // Thành công
      total: 1,
      data: { address },
      msg: 'Địa chỉ đã được cập nhật thành công',
    });
  } catch (err) {
    console.error('Lỗi khi cập nhật địa chỉ:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi cập nhật địa chỉ',
    });
  }
}
async function addOrUpdatePhoneNumber(req, res) {
  try {
    const db= await connectToDB();
    const phoneNumber = req.body.phoneNumber;
    const userId = req.user.userId; // Lấy userId từ JWT token

    if (!phoneNumber) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Số điện thoại không hợp lệ
        msg: 'Số điện thoại không được để trống',
      });
    }

    const usersCollection = db.collection('users');
    const objectId = ObjectId.createFromHexString(userId);

    // Tìm người dùng hiện tại
    const user = await usersCollection.findOne({ _id: objectId });

    if (!user) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Người dùng không tồn tại
        msg: 'Không tìm thấy người dùng',
      });
    }

    // Cập nhật số điện thoại
    const update = { $set: { phoneNumber: phoneNumber } };

    const result = await usersCollection.updateOne(
      { _id: objectId },
      update
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Cập nhật không thành công
        msg: 'Cập nhật số điện thoại không thành công',
      });
    }

    // Trả về kết quả thành công
    res.json({
      ec: 0,  // Thành công
      total: 1,
      data: {phoneNumber },  // Trả về số điện thoại đã được cập nhật
      msg: 'Số điện thoại đã được cập nhật thành công',
    });
  } catch (err) {
    console.error('Lỗi khi cập nhật số điện thoại:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi cập nhật số điện thoại',
    });
  }
}
async function updateUserName(req, res) {
  try {
    const db= await connectToDB();
    const { newName } = req.body;
    const userId = req.user.userId; // Lấy userId từ JWT token

    if (!newName) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Tên mới không hợp lệ
        msg: 'Tên mới không được để trống',
      });
    }

    const usersCollection = db.collection('users');
    const objectId = ObjectId.createFromHexString(userId);

    // Tìm người dùng hiện tại
    const user = await usersCollection.findOne({ _id: objectId });

    if (!user) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Người dùng không tồn tại
        msg: 'Không tìm thấy người dùng',
      });
    }

    // Cập nhật tên người dùng
    const result = await usersCollection.updateOne(
      { _id: objectId },
      { $set: { name: newName } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Cập nhật không thành công
        msg: 'Cập nhật tên người dùng không thành công',
      });
    }

    // Trả về kết quả thành công
    res.json({
      ec: 0,  // Thành công
      total: 1,
      data: { name: newName },  // Trả về tên người dùng đã được cập nhật
      msg: 'Tên người dùng đã được cập nhật thành công',
    });
  } catch (err) {
    console.error('Lỗi khi cập nhật tên người dùng:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi cập nhật tên người dùng',
    });
  }
}
async function changePass(req, res) {
  try {
    const db= await connectToDB();
    const { oldPassword, newPassword } = req.body;
    const email = req.user.email; // assuming req.user is set from the JWT token

    // Kiểm tra đầu vào hợp lệ
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        ec: 1,  // Lỗi thông tin đầu vào
        msg: 'Thông tin mật khẩu không hợp lệ',
      });
    }

    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email });

    // Kiểm tra nếu không tìm thấy người dùng
    if (!user) {
      return res.status(401).json({
        ec: 1,  // Lỗi thông tin người dùng không hợp lệ
        msg: 'Người dùng không hợp lệ',
      });
    }

    // Kiểm tra mật khẩu cũ
    const isValidOldPassword = await bcrypt.compare(oldPassword, user.hashedPassword);
    if (!isValidOldPassword) {
      return res.status(401).json({
        ec: 1,  // Lỗi mật khẩu cũ không đúng
        msg: 'Mật khẩu cũ không đúng',
      });
    }

    // Hash mật khẩu mới
    const hashedNewPassword = await bcrypt.hash(newPassword, user.salt);

    // Cập nhật mật khẩu trong CSDL
    const filter = { _id: new ObjectId(user._id) };
    const update = { $set: { hashedPassword: hashedNewPassword } };
    await usersCollection.updateOne(filter, update);

    // Trả về thành công
    return res.json({
      ec: 0,  // Thành công
      msg: 'Đổi mật khẩu thành công',
    });
  } catch (err) {
    console.error('Lỗi khi đổi mật khẩu:', err);
    return res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi đổi mật khẩu',
    });
  }
}
////////team
async function createTeam(req, res) {
  try {
    const db = await connectToDB();
    const { name, description, sport, emails } = req.body; // Lấy email từ yêu cầu

    if (!name || !description || !sport) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Thiếu thông tin cần thiết       
        msg: 'Thiếu thông tin cần thiết',
      });
    }

    const teamCollection = db.collection('team');
    const userCollection = db.collection('users'); // Collection chứa thông tin người dùng
    const captainId = req.user.userId;
    const objectId = ObjectId.createFromHexString(captainId);

    // Kiểm tra xem người dùng có phải là đội trưởng của đội khác không
    const existingTeam = await teamCollection.findOne({ captain: objectId });
    if (existingTeam) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Người dùng đã là đội trưởng của đội khác
        msg: 'Người tạo đã là đội trưởng của đội khác',
      });
    }

    // Tạo thông tin đội mới
    const membersIds = [objectId]; // Bắt đầu với ID của đội trưởng

    // Kiểm tra danh sách email và tìm kiếm người dùng
    if (Array.isArray(emails)) {
      for (const email of emails) {
        const user = await userCollection.findOne({ email });
        if (user) {
          membersIds.push(user._id); // Thêm ID của người dùng vào mảng members nếu tìm thấy
        }
      }
    }

    // Tạo đội mới với mảng members đã cập nhật
    const team = {
      name: name,
      description: description,
      sport: sport,
      captain: objectId,
      members: membersIds, // Thêm các ID vào mảng thành viên
    };

    const result = await teamCollection.insertOne(team);
    console.log(`New team added with ID ${result.insertedId}`);

    // Trả về phản hồi thành công
    res.json({
      ec: 0,  // Thành công
      data: { teamId: result.insertedId },  // Trả về một object
      msg: 'Tạo đội thành công',
    });
  } catch (err) {
    console.error('Lỗi tạo đội:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi tạo đội',
    });
  } 
}

async function addMember(req, res) {
  try {
    const db = await connectToDB();
    const { memberEmail } = req.body; // Truy cập email từ body
    const captainId = req.user.userId;

    // Kiểm tra xem memberEmail có tồn tại không
    if (!memberEmail) {
      return res.status(400).json({
        ec: 1,  // Lỗi thiếu thông tin hoặc email không hợp lệ
        msg: 'Thiếu thông tin cần thiết hoặc email không hợp lệ',
      });
    }

    const teamCollection = db.collection('team');
    const userCollection = db.collection('users'); // Giả sử bạn có collection tên là 'users'
    const captainObjectId = ObjectId.createFromHexString(captainId);

    // Tìm đội mà người dùng là đội trưởng
    const team = await teamCollection.findOne({ captain: captainObjectId });

    if (!team) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Đội không tồn tại hoặc người dùng không phải đội trưởng
        msg: 'Đội không tồn tại hoặc người dùng không phải đội trưởng',
      });
    }

    // Tìm thành viên dựa trên email
    const member = await userCollection.findOne({ email: memberEmail });

    if (!member) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Không tìm thấy người dùng với email đã cung cấp
        msg: 'Không tìm thấy người dùng với email đã cung cấp',
      });
    }

    const memberObjectId = member._id;

    // Kiểm tra xem thành viên đã có trong đội chưa
    if (team.members.some(member => member.equals(memberObjectId))) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Thành viên đã có trong đội
        msg: 'Thành viên đã có trong đội',
      });
    }

    // Thêm thành viên vào đội
    const result = await teamCollection.updateOne(
      { _id: team._id },
      { $push: { members: memberObjectId } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Không thêm được thành viên
        msg: 'Lỗi khi thêm thành viên',
      });
    }

    // Trả về kết quả thành công
    res.json({
      ec: 0,  // Thành công
      total: 1,
      data: { teamId: team._id, newMemberId: memberObjectId },
      msg: 'Thành viên được thêm thành công',
    });
  } catch (err) {
    console.error('Lỗi khi thêm thành viên:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi thêm thành viên',
    });
  }
}
async function removeMember(req, res) {
  try {
    const db= await connectToDB();
    const { memberId } = req.body;
    const captainId = req.user.userId;

    if (!memberId) {
      return res.status(400).json({
        ec: 1,  // Lỗi thiếu thông tin
        
        msg: 'Thiếu thông tin cần thiết',
      });
    }

    const teamCollection = db.collection('team');
    const captainObjectId = ObjectId.createFromHexString(captainId);

    // Tìm đội mà người dùng là đội trưởng
    const team = await teamCollection.findOne({ captain: captainObjectId });

    if (!team) {
      return res.status(404).json({
        ec: 1,  // Lỗi: Đội không tồn tại hoặc người dùng không phải đội trưởng
        
        msg: 'Đội không tồn tại hoặc người dùng không phải đội trưởng',
      });
    }

    const memberObjectId = ObjectId.createFromHexString(memberId);

    // Kiểm tra xem thành viên có trong đội hay không
    if (!team.members.some(member => member.equals(memberObjectId))) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Thành viên không có trong đội
        
        msg: 'Thành viên không có trong đội',
      });
    }

    // Xóa thành viên khỏi đội
    const result = await teamCollection.updateOne(
      { _id: team._id },
      { $pull: { members: memberObjectId } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        ec: 1,  // Lỗi: Không xóa được thành viên
        
        msg: 'Lỗi khi xóa thành viên',
      });
    }

    // Trả về kết quả thành công
    res.json({
      ec: 0,  // Thành công
      data: { teamId: team._id, removedMemberId: memberObjectId },
      msg: 'Thành viên đã được xóa thành công',
    });
  } catch (err) {
    console.error('Lỗi khi xóa thành viên:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      
      msg: 'Lỗi server khi xóa thành viên',
    });
  } 
}
async function getTeamInfo(req, res) {
  try {
    const db = await connectToDB();
    const userId = req.user.userId;
    const objectId = ObjectId.createFromHexString(userId);

    const teamCollection = db.collection('team');
    const userCollection = db.collection('users'); // Collection chứa thông tin người dùng

    // Tìm tất cả các đội mà người dùng là đội trưởng hoặc thành viên
    const teams = await teamCollection.find({
      $or: [{ captain: objectId }, { members: objectId }]
    }).toArray();

    // Nếu không tìm thấy đội nào, trả về mảng rỗng
    if (teams.length === 0) {
      return res.json({
        ec: 0,  // Thành công
        data: [],
        msg: 'Người dùng không thuộc đội nào',
      });
    }

    // Truy vấn thông tin của các đội, bao gồm danh sách thành viên và đội trưởng
    const teamDetails = await Promise.all(teams.map(async team => {
      // Lấy thông tin các thành viên
      const memberIds = team.members || [];
      const membersInfo = await userCollection.find(
        { _id: { $in: memberIds } }, // Tìm tất cả người dùng có _id nằm trong danh sách memberIds
        { projection: { _id: 1, username: 1,email:1 } } // Chỉ lấy _id và tên của thành viên
      ).toArray();

      // Lấy thông tin đội trưởng
      const captainInfo = await userCollection.findOne(
        { _id: team.captain },
        { projection: { _id: 1, username: 1 } } // Lấy _id và tên của đội trưởng
      );

      return {
        teamId: team._id,
        name: team.name,
        description: team.description,
        sport: team.sport,
        captain: {
          _id: captainInfo._id,
          username: captainInfo.username, // Trả về tên của đội trưởng
        },
        members: membersInfo // Trả về thông tin của các thành viên với tên và _id
      };
    }));

    // Trả về danh sách tất cả các đội mà người dùng tham gia
    res.json({
      ec: 0,  // Thành công
      total: teamDetails.length,
      data: teamDetails,
      msg: 'Lấy danh sách đội thành công',
    });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách đội:', err);
    res.status(500).json({
      ec: 2,  // Lỗi server
      msg: 'Lỗi server khi lấy danh sách đội',
    });
  }
}
async function updateTeam(req, res){
  try {
    const { name, description, sport } = req.body; // Lấy dữ liệu từ body request
    const userId = req.user.userId; // Lấy ID của đội trưởng từ token đã verify

    const db = await connectToDB(); // Kết nối tới cơ sở dữ liệu
    const teamsCollection = db.collection('team');

    // Tìm đội dựa trên ID của đội trưởng
    const captainId=ObjectId.createFromHexString(userId);
    const team = await teamsCollection.findOne({ captain: captainId});

    // Kiểm tra nếu không tìm thấy đội
    if (!team) {
      return res.status(404).json({
        ec: 1, // Không tìm thấy dữ liệu
        msg: 'Không tìm thấy đội do đội trưởng quản lý.',
      });
    }
    const updateFields = {};
    if (name) updateFields.name = name;
    if (description) updateFields.description = description;
    if (sport) updateFields.sport = sport;


    // Cập nhật đội
    const result = await teamsCollection.updateOne(
      { _id: team._id },
      { $set: updateFields  }
    );

    // Kiểm tra xem đội đã được cập nhật hay chưa
    if (result.matchedCount === 0) {
      return res.status(404).json({
        ec: 1, // Không tìm thấy dữ liệu
        msg: 'Không tìm thấy đội để cập nhật.',
      });
    }

    res.status(200).json({
      ec: 0, // Thành công
      msg: 'Cập nhật đội thành công.',
    });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({
      ec: 1, // Lỗi hệ thống
      msg: 'Đã xảy ra lỗi khi cập nhật đội.',
    });
  }
};











//field
async function searchField(req, res) {
  try {
    const { date, startTime, endTime, location, sport, capacity, page = 1, record = 10 } = req.query;

    // Kiểm tra các tham số bắt buộc
    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        ec: 1,
        msg: 'Thiếu thông tin bắt buộc: date, startTime, hoặc endTime',
      });
    }

    const db = await connectToDB(); // Kết nối đến MongoDB
    const fieldsCollection = db.collection('field');

    // Bước 1: Tìm các sân thỏa mãn điều kiện về location, capacity, sport
    const searchCriteria = {};
    
    if (location) {
      searchCriteria.location = location;
    }
    if (sport) {
      searchCriteria.sport = sport;
    }
    if (capacity) {
      searchCriteria.capacity = { $gte: parseInt(capacity) }; // Sức chứa >= yêu cầu
    }

    // Lấy danh sách các sân thỏa mãn điều kiện
    const availableFields = await fieldsCollection.find(searchCriteria).toArray();

    // Nếu không tìm thấy sân nào thỏa mãn
    if (availableFields.length === 0) {
      return res.status(404).json({
        ec: 1,
        data: [],
        msg: 'Không tìm thấy sân nào phù hợp',
      });
    }

    // Lấy danh sách ID của các sân có sẵn
    const availableFieldIds = availableFields.map(field => field._id);

    const bookingsCollection = db.collection('booking');

    // Bước 2: Tìm các sân đã được đặt trong khoảng thời gian này
    const bookedFields = await bookingsCollection.aggregate([
      {
        $match: {
          date: date, // Lọc theo ngày đã cho
          startTime: { $lt: endTime }, // Bắt đầu trước thời gian kết thúc
          endTime: { $gt: startTime },   // Kết thúc sau thời gian bắt đầu
        },
      },
      {
        $group: {
          _id: "$field", // Nhóm theo sân
        },
      },
    ]).toArray(); // Chuyển đổi kết quả thành mảng

    const bookedFieldIds = bookedFields.map(field => field._id);

    // Bước 3: Lọc ra các sân có ID trong danh sách bookedFieldIds
    const finalAvailableFields = availableFields.filter(field => !bookedFieldIds.includes(field._id));

    // Tính toán số lượng bản ghi cần bỏ qua
    const skip = (page - 1) * record;

    // Lấy danh sách các sân trống với phân trang
    const paginatedFields = finalAvailableFields.slice(skip, skip + parseInt(record));

    // Tính toán tổng số trang
    const totalFields = finalAvailableFields.length;
    const totalPages = Math.ceil(totalFields / record);

    // Kiểm tra và trả về kết quả
    if (paginatedFields.length === 0) {
      return res.status(404).json({
        ec: 1,
        data: [],
        msg: 'Không tìm thấy sân trống',
      });
    }

    res.status(200).json({
      ec: 0,
      total: totalFields,
      data: paginatedFields,
      msg: 'Tìm thấy các sân trống',
      totalPages: totalPages,
    });
  } catch (err) {
    console.error('Lỗi khi tìm kiếm sân:', err);
    res.status(500).json({
      ec: 2,
      data: [],
      msg: 'Lỗi server nội bộ khi tìm kiếm sân',
    });
  }
}




//equipmment
async function searchEquipment(req, res) {
  try {
    // Lấy tham số sport và page từ query
    const { sport, page = 1 } = req.query;
    const limit = 10; // Số thiết bị mỗi trang

    // Kiểm tra nếu sport không có giá trị
    if (!sport) {
      return res.status(400).json({
        ec: 1,  // Lỗi thiếu thông tin
        
        msg: 'Thiếu tham số sport.',
      });
    }

    const db= await connectToDB();
    const equipmentCollection = db.collection('equipment');

    // Tính toán số lượng bản ghi cần bỏ qua
    const skip = (page - 1) * limit;

    // Tìm kiếm thiết bị trong cơ sở dữ liệu với phân trang
    const equipments = await equipmentCollection.find({ sport }).skip(skip).limit(limit).toArray();

    // Lấy tổng số lượng thiết bị để tính số trang
    const totalEquipments = await equipmentCollection.countDocuments({ sport });

    // Kiểm tra nếu không tìm thấy thiết bị nào
    if (equipments.length === 0) {
      return res.status(404).json({
        ec: 1,  // Lỗi không tìm thấy thiết bị
        
        msg: 'Không tìm thấy thiết bị nào.',
      });
    }

    // Tính toán tổng số trang
    const totalPages = Math.ceil(totalEquipments / limit);

    // Trả về kết quả tìm kiếm
    res.status(200).json({
      ec: 0,  // Thành công
      total: equipments.length,
      totalPages: totalPages, // Tổng số trang
      currentPage: parseInt(page), // Trang hiện tại
      data: equipments, // Trả về mảng thông tin về các thiết bị
      msg: 'Tìm thấy thiết bị.',
    });
  } catch (error) {
    // Xử lý lỗi
    console.error('Lỗi khi tìm kiếm thiết bị:', error);
    res.status(500).json({
      ec: 2,  // Lỗi server
      data: [],
      msg: 'Đã xảy ra lỗi khi tìm kiếm thiết bị.',
    });
  }
}

//referee
async function searchReferee(req, res) {
  try {
    // Lấy tham số sport, area và page từ query
    const { sport, area, page = 1 } = req.query;
    const limit = 10; // Số trọng tài mỗi trang

    // Xây dựng điều kiện tìm kiếm
    const searchCriteria = {};
    
    if (sport) {
      searchCriteria.sport = sport;
    }
    
    if (area) {
      // area có thể là một chuỗi phân tách bằng dấu phẩy, chuyển đổi thành mảng
      const areaArray = area.split(',').map(a => a.trim());
      searchCriteria.area = { $in: areaArray };
    }

    const db= await connectToDB();
    const refereeCollection = db.collection('referee');

    // Tính toán số lượng bản ghi cần bỏ qua
    const skip = (page - 1) * limit;

    // Tìm kiếm trọng tài trong cơ sở dữ liệu với phân trang
    const referees = await refereeCollection.find(searchCriteria).skip(skip).limit(limit).toArray();

    // Lấy tổng số lượng trọng tài để tính số trang
    const totalReferees = await refereeCollection.countDocuments(searchCriteria);

    // Kiểm tra nếu không tìm thấy trọng tài nào
    if (referees.length === 0) {
      return res.status(404).json({
        ec: 1,  // Lỗi không tìm thấy trọng tài
        
        msg: 'Không tìm thấy trọng tài nào.',
      });
    }

    // Tính toán tổng số trang
    const totalPages = Math.ceil(totalReferees / limit);

    // Trả về kết quả tìm kiếm
    res.status(200).json({
      ec: 0,  // Thành công
      total: referees.length,
      totalPages: totalPages, // Tổng số trang
      currentPage: parseInt(page), // Trang hiện tại
      data: referees, // Trả về mảng thông tin về các trọng tài
      msg: 'Tìm thấy trọng tài.',
    });
  } catch (error) {
    // Xử lý lỗi
    console.error('Lỗi khi tìm kiếm trọng tài:', error);
    res.status(500).json({
      ec: 2,  // Lỗi server
      
      msg: 'Đã xảy ra lỗi khi tìm kiếm trọng tài.',
    });
  }
}

//trainer
async function searchTrainer(req, res) {
  try {
    // Lấy tham số sport, area và page từ query
    const { sport, area, page = 1 } = req.query;
    const limit = 10; // Số trọng tài mỗi trang

    // Xây dựng điều kiện tìm kiếm
    const searchCriteria = {};
    
    if (sport) {
      searchCriteria.sport = sport;
    }
    
    if (area) {
      // area có thể là một chuỗi phân tách bằng dấu phẩy, chuyển đổi thành mảng
      const areaArray = area.split(',').map(a => a.trim());
      searchCriteria.area = { $in: areaArray };
    }

    const db= await connectToDB();
    const refereeCollection = db.collection('trainer');

    // Tính toán số lượng bản ghi cần bỏ qua
    const skip = (page - 1) * limit;

    // Tìm kiếm trọng tài trong cơ sở dữ liệu với phân trang
    const referees = await refereeCollection.find(searchCriteria).skip(skip).limit(limit).toArray();

    // Lấy tổng số lượng trọng tài để tính số trang
    const totalReferees = await refereeCollection.countDocuments(searchCriteria);

    // Kiểm tra nếu không tìm thấy trọng tài nào
    if (referees.length === 0) {
      return res.status(404).json({
        ec: 1,  // Lỗi không tìm thấy trọng tài
        
        msg: 'Không tìm thấy trainer nào.',
      });
    }

    // Tính toán tổng số trang
    const totalPages = Math.ceil(totalReferees / limit);

    // Trả về kết quả tìm kiếm
    res.status(200).json({
      ec: 0,  // Thành công
      total: referees.length,
      totalPages: totalPages, // Tổng số trang
      currentPage: parseInt(page), // Trang hiện tại
      data: referees, // Trả về mảng thông tin về các trọng tài
      msg: 'Tìm thấy trainer.',
    });
  } catch (error) {
    // Xử lý lỗi
    console.error('Lỗi khi tìm kiếm :', error);
    res.status(500).json({
      ec: 2,  // Lỗi server
      
      msg: 'Đã xảy ra lỗi khi tìm kiếm.',
    });
  }
}
//booking
async function createBooking(req, res) {
  try {
    const { fieldId, date, startTime, endTime, equipmentId, refereeId, trainerId } = req.body;
    const userId = req.user.userId;

    // Kiểm tra các thông tin cần thiết
    if (!fieldId || !date || !startTime || !endTime) {
      return res.status(400).json({ ec: 1, msg: 'Thiếu thông tin cần thiết: fieldId, date, startTime hoặc endTime.' });
    }

    // Chuyển đổi các thông số ngày giờ
    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);

    // Kiểm tra thời gian
    if (startDateTime >= endDateTime) {
      return res.status(400).json({ ec: 1, msg: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
    }

    const db = await connectToDB();

    // Kiểm tra xem sân đã được đặt vào khung giờ này chưa
    const bookingsCollection = db.collection('booking');
    const isBooked = await bookingsCollection.findOne({
      field: ObjectId.createFromHexString(fieldId),
      $or: [
        { startTime: { $lt: endDateTime }, endTime: { $gt: startDateTime } }
      ]
    });

    if (isBooked) {
      return res.status(409).json({ ec: 1, msg: 'Sân đã được đặt vào khung giờ này.' });
    }

    let totalPrice = 0;

    // Tìm thông tin sân
    const fieldCollection = db.collection('field');
    const field = await fieldCollection.findOne({ _id: ObjectId.createFromHexString(fieldId) });
    if (!field) {
      return res.status(404).json({
        ec: 3,  // Lỗi sân không tồn tại
        msg: 'Sân không tồn tại.',
      });
    }
    totalPrice += field.price;

    // Tìm thông tin thiết bị nếu có
    if (equipmentId) {
      const equipmentCollection = db.collection('equipment');
      const equipment = await equipmentCollection.findOne({ _id: ObjectId.createFromHexString(equipmentId) });
      if (equipment) {
        totalPrice += equipment.price;
      }
    }

    // Tìm thông tin trọng tài nếu có
    if (refereeId) {
      const refereeCollection = db.collection('referee');
      const referee = await refereeCollection.findOne({ _id: ObjectId.createFromHexString(refereeId) });
      if (referee) {
        totalPrice += referee.price;
      }
    }

    // Tìm thông tin huấn luyện viên nếu có
    if (trainerId) {
      const trainerCollection = db.collection('trainer');
      const trainer = await trainerCollection.findOne({ _id: ObjectId.createFromHexString(trainerId) });
      if (trainer) {
        totalPrice += trainer.price;
      }
    }

    // Tạo booking mới
    const newBooking = {
      user: ObjectId.createFromHexString(userId),
      field: ObjectId.createFromHexString(fieldId),
      date: date ,
      startTime: startTime,
      endTime: endTime,
      totalPrice,
      status: 'unpaid',
      match:false,
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);
    res.status(200).json({ ec: 0, data: { bookingId: result.insertedId }, msg: 'Đặt sân thành công.' });

  } catch (error) {
    console.error('Error booking field:', error);
    res.status(500).json({ ec: 2, msg: 'Đã xảy ra lỗi khi đặt sân.' });
  }
}
async function getBooking(req, res) {
  try {
    const userId = req.user.userId; // Lấy userId từ thông tin đăng nhập
    const page = parseInt(req.query.page) || 1; // Lấy trang hiện tại, mặc định là trang 1
    const record = 10; // Số lượng booking trả về tối đa là 10

    const db = await connectToDB(); // Kết nối đến database
    const bookingsCollection = db.collection('booking');
    const fieldsCollection = db.collection('field'); // Kết nối đến collection field

    // Lấy danh sách tất cả các booking của người dùng
    const bookings = await bookingsCollection
      .find({
        user: ObjectId.createFromHexString(userId), // Lọc theo userId
      })
      .sort({ createdAt: -1 }) // Sắp xếp theo thứ tự mới nhất
      .skip((page - 1) * record) // Bỏ qua các kết quả của trang trước
      .limit(record) // Giới hạn kết quả trả về tối đa 10 bản ghi
      .toArray(); // Chuyển đổi kết quả thành mảng

    // Nếu không có booking nào
    if (bookings.length === 0) {
      return res.status(404).json({
        ec: 1, // Không có lịch sử booking
        msg: 'Không tìm thấy lịch sử đặt sân',
        data: [],
      });
    }

    // Lấy thêm thông tin sân và môn thể thao từ collection field
    const bookingsWithFieldInfo = [];

    for (const booking of bookings) {
      const fieldId = booking.field; // ID sân

      // Kiểm tra xem fieldId có hợp lệ không
      if (!ObjectId.isValid(fieldId)) {
        bookingsWithFieldInfo.push({
          ...booking,
          fieldName: 'ID sân không hợp lệ', // Ghi chú về ID không hợp lệ
          sport: 'Không có môn thể thao', // Thông tin môn thể thao không có
        });
        continue;
      }

      const field = await fieldsCollection.findOne({ _id: fieldId});
      bookingsWithFieldInfo.push({
        ...booking,
        fieldName: field ? field.name : 'Không có tên sân', // Thêm tên sân vào kết quả
        sport: field ? field.sport : 'Không có môn thể thao', // Thêm môn thể thao vào kết quả
      });
    }

    // Trả về danh sách booking với tên sân và môn thể thao
    res.status(200).json({
      ec: 0, // Thành công
      total: bookingsWithFieldInfo.length,
      data: bookingsWithFieldInfo,
      msg: 'Lấy lịch sử đặt sân thành công',
    });
  } catch (err) {
    console.error('Lỗi khi lấy lịch sử booking:', err);
    res.status(500).json({
      ec: 2, // Lỗi server
      msg: 'Lỗi server khi lấy lịch sử đặt sân',
    });
  }
}


//matching
async function sendMatchRequest(req, res) {
  try {
    const { fieldId, date, startTime, endTime, sport, totalPrice,message, max_number } = req.body;

    // Kiểm tra dữ liệu cần thiết
    if (  !date||!fieldId || !startTime || !endTime || !max_number) {
      return res.status(400).json({
        ec: 1, // Lỗi thiếu thông tin
        msg: 'Thiếu thông tin cần thiết.',
      });
    }

    // Kiểm tra nếu thời gian bắt đầu và kết thúc hợp lệ
    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);

    // Kiểm tra thời gian
    if (startDateTime >= endDateTime) {
      return res.status(400).json({ ec: 1, msg: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
    }

    const db= await connectToDB();
    const matchCollection = db.collection('matching');
    const bookingCollection=db.collection('booking');

    // Kiểm tra xem sân đã có yêu cầu nào trong khoảng thời gian này chưa
    const existingRequest = await matchCollection.findOne({
      fieldId,
      $and: [
        {
          startTime: { $lt: new Date(endTime) }, // Yêu cầu bắt đầu trước thời gian kết thúc của yêu cầu mới
          endTime: { $gt: new Date(startTime) } // Yêu cầu kết thúc sau thời gian bắt đầu của yêu cầu mới
        }
      ]
    });

    if (existingRequest) {
      return res.status(400).json({
        ec: 1, // Lỗi đã có yêu cầu
        msg: 'Sân đã có yêu cầu trong khoảng thời gian này.',
      });
    }
    const userid=req.user.userId;
    // Tạo một yêu cầu mới
    const newRequest =({
      userId:ObjectId.createFromHexString(userid),
      fieldId:ObjectId.createFromHexString(fieldId),
      date,
      startTime: startTime,
      endTime: endTime,
      sport:sport, totalPrice:parseInt(totalPrice),
      message: message || '', // Đảm bảo message không null
      max_number,
      matchedUser: [], // Khởi tạo mảng matchedUser rỗng
      matchedCount: 0,
    });

    // Lưu vào cơ sở dữ liệu
    const result = await matchCollection.insertOne(newRequest);
    const r=await bookingCollection.updateOne(
      { field:ObjectId.createFromHexString(fieldId), date:date, startTime:startTime,endTime: endTime, match: false }, // Tìm booking với match = false
      { $set: { match: true } } // Cập nhật match thành true
    );
    console.log(r)

    res.status(201).json({
      ec: 0, // Thành công
      data: { _id: result.insertedId },
      msg: 'Gửi yêu cầu thành công.',
    });
  } catch (error) {
    console.error('Error sending match request:', error);
    res.status(500).json({
      ec: 2, // Lỗi server
      msg: 'Đã xảy ra lỗi khi gửi yêu cầu.',
    });
  }
}



async function getMatchRequests(req, res) {
  try {
    // Kết nối đến cơ sở dữ liệu
    const db = await connectToDB();
    const matchRequestCollection = db.collection('matching');
    const fieldsCollection = db.collection('field'); // Collection field để lấy thông tin sân

    // Lấy các tham số lọc từ query params
    const { sport, location } = req.query;

    // Tạo bộ lọc cho matching
    const filter = {};
    
    // Nếu có lọc theo sport
    if (sport) {
      filter.sport = sport; // Thêm điều kiện lọc sport vào
    }

    // Tìm tất cả các matching theo bộ lọc sport
    const matchings = await matchRequestCollection.find(filter).toArray();

    // Nếu không có matching nào thỏa mãn điều kiện
    if (matchings.length === 0) {
      return res.status(200).json({
        ec: 0, // Thành công
        total: 0,
        data: [],
        msg: 'Không có yêu cầu matching nào thỏa mãn điều kiện sport.',
      });
    }

    // Lọc các matching có fieldId và tìm thông tin sân từ fieldId
    const fieldIds = matchings.map(matching => matching.fieldId);

    // Tạo bộ lọc cho collection field
    const fieldFilter = { _id: { $in: fieldIds } };

    // Nếu có truyền vào location, thêm điều kiện lọc location
    if (location) {
      fieldFilter.location = location;
    }

    // Tìm các sân có fieldId tương ứng và (nếu có) location được truyền vào
    const fields = await fieldsCollection.find(fieldFilter).toArray();

    // Nếu không có sân nào thỏa mãn điều kiện location (nếu có)
    if (fields.length === 0) {
      return res.status(200).json({
        ec: 0, // Thành công
        total: 0,
        data: [],
        msg: 'Không có sân nào phù hợp với location đã chọn.',
      });
    }

    // Kết hợp matching với thông tin sân
    const result = matchings.filter(matching =>
      fields.some(field => field._id.equals(matching.fieldId))
    ).map(matching => {
      const field = fields.find(field => field._id.equals(matching.fieldId));
      return {
        ...matching,
        fieldInfo: field, // Thêm thông tin sân vào matching
      };
    });

    // Trả về kết quả
    res.status(200).json({
      ec: 0, // Thành công
      total: result.length,
      data: result, // Dữ liệu matching với thông tin sân
      msg: 'Lấy danh sách matching thành công.',
    });
  } catch (error) {
    console.error('Error getting matchings:', error);
    res.status(500).json({
      ec: 2, // Lỗi server
      msg: 'Đã xảy ra lỗi khi lấy danh sách matching.',
    });
  }
}



async function respondToMatchRequest(req, res) {
  try {
    const { matchingId, quantity } = req.body;

    // Kiểm tra các tham số cần thiết
    if (!matchingId || !quantity) {
      return res.status(400).json({
        ec: 1, // Lỗi thiếu thông tin
        msg: 'Thiếu thông tin cần thiết.',
      });
    }

    // Kết nối đến cơ sở dữ liệu
    const db= await connectToDB();
    const matchRequestCollection = db.collection('matching');

    // Tìm kiếm yêu cầu matching theo ID
    const matchRequest = await matchRequestCollection.findOne({ _id: ObjectId.createFromHexString(matchingId) });

    if (!matchRequest) {
      return res.status(404).json({
        ec: 1, // Lỗi không tìm thấy yêu cầu
        msg: 'Không tìm thấy yêu cầu matching.',
      });
    }

    const remainingSlots = matchRequest.max_number - matchRequest.matchedCount;

    // Kiểm tra nếu số lượng yêu cầu vượt quá số slot còn lại
    if (remainingSlots < quantity) {
      return res.status(400).json({
        ec: 1, // Lỗi vượt quá slot
        msg: 'Số lượng yêu cầu vượt quá số slot còn lại.',
      });
    }

    // Cập nhật thông tin người dùng và số lượng vào matchedUser
    const updateData = {
      $push: { matchedUser: { userId: req.user.userId, quantity: quantity } },
      $inc: { matchedCount: quantity }, // Cộng thêm quantity vào matchedCount
      $set: { updatedAt: new Date() },
    };

    const result = await matchRequestCollection.updateOne(
      { _id: ObjectId.createFromHexString(matchingId) },
      updateData
    );

    res.status(200).json({
      ec: 0, // Thành công
      data: result, // Trả về thông tin cập nhật
      msg: 'Phản hồi yêu cầu thành công.',
    });
  } catch (error) {
    console.error('Error responding to match request:', error);
    res.status(500).json({
      ec: 2, // Lỗi server
      msg: 'Đã xảy ra lỗi khi phản hồi yêu cầu.',
    });
  }
}



// Lấy access token từ PayPal
const getPayPalAccessToken = async () => {
  const PAYPAL_CLIENT_ID = process.env.CLIENT_ID;
  const PAYPAL_SECRET = process.env.SECRET;
  
  const response = await axios({
    url: 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    auth: {
      username: PAYPAL_CLIENT_ID,
      password: PAYPAL_SECRET,
    },
    data: 'grant_type=client_credentials',
  });

  return response.data.access_token; // Trả về access token
};

async function createOrder(req, res) {
  try {
    // Lấy bookingId và totalAmount từ body request
    const { bookingId, totalPrice,return_url,cancel_url } = req.body;

    // Kiểm tra xem bookingId và totalAmount có được cung cấp hay không
    if (!bookingId || !totalPrice) {
      return res.status(400).json({
        ec: 1,
        msg: 'Thiếu thông tin bookingId hoặc totalAmount để tạo đơn hàng',
      });
    }

    // Lấy access token từ PayPal
    const accessToken = await getPayPalAccessToken();

    // Gọi API PayPal để tạo đơn hàng
    const response = await axios({
      url: 'https://api-m.sandbox.paypal.com/v2/checkout/orders',
      method: 'post',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': bookingId, // Thêm PayPal-Request-Id duy nhất cho yêu cầu này
      },
      data: {
        intent: 'CAPTURE', // Ý định thanh toán (CAPTURE hoặc AUTHORIZE)
        purchase_units: [
          {
            reference_id: bookingId, // Tham chiếu đến bookingId
            amount: {
              currency_code: 'USD', // Hoặc mã tiền tệ khác nếu cần
              value: totalPrice.toString(), // Đảm bảo giá trị là chuỗi
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
              brand_name: 'SportVenue', // Tên thương hiệu của bạn
              locale: 'en-US', // Locale của người dùng
              landing_page: 'LOGIN', // Trang hiển thị (LOGIN hoặc BILLING)
              shipping_preference: 'NO_SHIPPING', // Không yêu cầu thông tin vận chuyển
              user_action: 'PAY_NOW', // Hành động người dùng
              return_url: 'https://example.com/returnUrl', // URL khi thanh toán thành công
              cancel_url: 'https://example.com/cancelUrl', // URL khi thanh toán bị hủy
            },
          },
        },
      },
    });

    // Phản hồi với dữ liệu từ PayPal
    res.json({
      ec: 0,
      msg: 'Tạo đơn hàng thành công',
      data: response.data, // Trả về dữ liệu từ PayPal
    });
  } catch (err) {
    console.error('Lỗi khi tạo đơn hàng:', err);
    res.status(500).json({
      ec: 2,
      msg: 'Lỗi server khi tạo đơn hàng',
    });
  }
}








// controller/paymentController.js
async function captureOrder(req, res) {
  try {
    // Lấy bookingId từ body request
    const { orderId } = req.body;

    // Kiểm tra xem bookingId có được cung cấp hay không
    if (!orderId) {
      return res.status(400).json({
        ec: 1,
        msg: 'Thiếu thông tin bookingId để xác nhận thanh toán',
      });
    }

    // Lấy access token từ PayPal
    const accessToken = await getPayPalAccessToken();

    // Gọi API PayPal để capture đơn hàng
    const response = await axios.get(
      `https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}` // access token từ PayPal
        }
      }
    );

    // Kiểm tra trạng thái phản hồi từ PayPal
    if (response.data.status === 'COMPLETED') {
      return res.json({
        ec: 0,
        msg: 'Thanh toán thành công',
        data: response.data, // Trả về dữ liệu thanh toán từ PayPal
      });
    } else {
      return res.status(400).json({
        ec: 1,
        msg: 'Thanh toán chưa hoàn tất',
        data: response.data,
      });
    }
  } catch (err) {
    console.error('Lỗi khi capture đơn hàng:', err);
    res.status(500).json({
      ec: 2,
      msg: 'Lỗi server khi xác nhận thanh toán',
    });
  }
}
















































module.exports = { registerUser,loginUser,getUserInfo,addOrUpdateAddress,addOrUpdatePhoneNumber,changePass,updateUserName,
  createTeam, addMember,removeMember,getTeamInfo,updateTeam,
  searchField,
  searchEquipment,
  searchReferee,
  searchTrainer,
  createBooking,getBooking,
  sendMatchRequest,getMatchRequests,respondToMatchRequest,
  createOrder,captureOrder
};