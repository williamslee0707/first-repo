// 설정
const SPREADSHEET_ID = '1qPxsEnhVFPrIhy6p9dRY_6EyBuY4Scw2DUjEot-7150';
const GEMINI_API_KEY = 'AIzaSyDsBbCJF9eOyCwrnLXiqCYam4vJN36FrNQ';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

// 디버깅을 위한 로그 함수
function logDebug(message, data = null) {
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
}

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 구글 시트 접근 함수
function getSheet(sheetName) {
  try {
    logDebug('시트 접근 시도', { sheetName, spreadsheetId: SPREADSHEET_ID });
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      throw new Error(`시트 '${sheetName}'를 찾을 수 없습니다.`);
    }
    
    logDebug('시트 접근 성공', sheetName);
    return sheet;
  } catch (error) {
    logDebug('시트 접근 실패', { sheetName, error: error.toString() });
    throw error;
  }
}

// 유틸리티 함수들
function generateId() {
  return 'ID_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function hashPassword(password) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password)
    .map(function(byte) {
      return (byte + 256).toString(16).slice(-2);
    }).join('');
}

function formatPhoneNumber(phone) {
  return phone.replace(/[^0-9]/g, '').replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
}

// 사용자 관리 함수들
function registerUser(userData) {
  try {
    logDebug('회원가입 시작', userData);
    
    // 입력 데이터 검증
    if (!userData || !userData.name || !userData.phone || !userData.password) {
      return { success: false, message: '필수 정보가 누락되었습니다.' };
    }
    
    const userSheet = getSheet('사용자');
    
    // 헤더가 있는지 확인
    const range = userSheet.getDataRange();
    if (range.getNumRows() === 0) {
      // 헤더 추가
      userSheet.getRange(1, 1, 1, 8).setValues([
        ['사용자ID', '이름', '휴대폰번호', '비밀번호', '성별', '트레이너', '가입일', '최근접속일']
      ]);
      logDebug('헤더 추가 완료');
    }
    
    // 휴대폰 번호 중복 체크
    const data = userSheet.getDataRange().getValues();
    const phoneExists = data.slice(1).some(row => row[2] === formatPhoneNumber(userData.phone));
    
    if (phoneExists) {
      logDebug('중복된 휴대폰 번호', userData.phone);
      return { success: false, message: '이미 등록된 휴대폰 번호입니다.' };
    }
    
    // 비밀번호 유효성 검사
    if (userData.password.length < 4) {
      return { success: false, message: '비밀번호는 최소 4자리 이상이어야 합니다.' };
    }
    
    // 새 사용자 추가
    const userId = generateId();
    const hashedPassword = hashPassword(userData.password);
    const now = new Date();
    
    userSheet.appendRow([
      userId,
      userData.name,
      formatPhoneNumber(userData.phone),
      hashedPassword,
      userData.gender,
      userData.trainer,
      now,
      now
    ]);
    
    logDebug('회원가입 성공', { userId, name: userData.name });
    
    return { 
      success: true, 
      message: '회원가입이 완료되었습니다.',
      userId: userId,
      userData: {
        id: userId,
        name: userData.name,
        phone: formatPhoneNumber(userData.phone),
        gender: userData.gender,
        trainer: userData.trainer
      }
    };
    
  } catch (error) {
    logDebug('회원가입 오류', error.toString());
    return { success: false, message: '회원가입 중 오류가 발생했습니다: ' + error.toString() };
  }
}

function loginUser(phone, password) {
  try {
    logDebug('로그인 시도', { phone });
    
    const userSheet = getSheet('사용자');
    const data = userSheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return { success: false, message: '등록된 사용자가 없습니다.' };
    }
    
    const hashedPassword = hashPassword(password);
    const formattedPhone = formatPhoneNumber(phone);
    
    logDebug('로그인 검증', { formattedPhone, hashedPassword: hashedPassword.substring(0, 10) + '...' });
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      logDebug(`사용자 ${i} 확인`, { 
        storedPhone: row[2], 
        inputPhone: formattedPhone,
        phoneMatch: row[2] === formattedPhone,
        passwordMatch: row[3] === hashedPassword 
      });
      
      if (row[2] === formattedPhone && row[3] === hashedPassword) {
        // 최근 접속일 업데이트
        userSheet.getRange(i + 1, 8).setValue(new Date());
        
        logDebug('로그인 성공', { userId: row[0], name: row[1] });
        
        return {
          success: true,
          userData: {
            id: row[0],
            name: row[1],
            phone: row[2],
            gender: row[4],
            trainer: row[5]
          }
        };
      }
    }
    
    logDebug('로그인 실패 - 정보 불일치');
    return { success: false, message: '휴대폰 번호 또는 비밀번호가 일치하지 않습니다.' };
    
  } catch (error) {
    logDebug('로그인 오류', error.toString());
    return { success: false, message: '로그인 중 오류가 발생했습니다: ' + error.toString() };
  }
}

function resetPassword(phone) {
  try {
    const userSheet = getSheet('사용자');
    const data = userSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[2] === formatPhoneNumber(phone)) {
        // 임시 비밀번호 생성 (4자리 숫자)
        const tempPassword = Math.floor(1000 + Math.random() * 9000).toString();
        const hashedTempPassword = hashPassword(tempPassword);
        
        // 비밀번호 업데이트
        userSheet.getRange(i + 1, 4).setValue(hashedTempPassword);
        
        return {
          success: true,
          message: `임시 비밀번호: ${tempPassword}\n로그인 후 비밀번호를 변경해주세요.`,
          tempPassword: tempPassword
        };
      }
    }
    
    return { success: false, message: '등록되지 않은 휴대폰 번호입니다.' };
    
  } catch (error) {
    return { success: false, message: '비밀번호 재설정 중 오류가 발생했습니다: ' + error.toString() };
  }
}

// 기록 관리 함수들
function saveRecord(recordData) {
  try {
    logDebug('기록 저장 시작', recordData);
    
    const recordSheet = getSheet('기록');
    
    // 헤더가 있는지 확인
    const range = recordSheet.getDataRange();
    if (range.getNumRows() === 0) {
      // 헤더 추가
      recordSheet.getRange(1, 1, 1, 12).setValues([
        ['기록ID', '사용자ID', '타임스탬프', '기록유형', '스쿼트중량', '스쿼트성공', '벤치중량', '벤치성공', '데드중량', '데드성공', '총합계', '전체순위']
      ]);
      logDebug('기록 시트 헤더 추가 완료');
    }
    
    const recordId = generateId();
    
    // 총합계 계산
    let total = 0;
    if (recordData.squatSuccess === '성공') total += parseFloat(recordData.squatWeight) || 0;
    if (recordData.benchSuccess === '성공') total += parseFloat(recordData.benchWeight) || 0;
    if (recordData.deadSuccess === '성공') total += parseFloat(recordData.deadWeight) || 0;
    
    // 순위 계산
    const rank = calculateRank(total, recordData.userId);
    
    recordSheet.appendRow([
      recordId,
      recordData.userId,
      new Date(),
      recordData.recordType,
      recordData.squatWeight,
      recordData.squatSuccess,
      recordData.benchWeight,
      recordData.benchSuccess,
      recordData.deadWeight,
      recordData.deadSuccess,
      total,
      rank
    ]);
    
    logDebug('기록 저장 성공', { recordId, total, rank });
    
    return { 
      success: true, 
      recordId: recordId,
      total: total,
      rank: rank
    };
    
  } catch (error) {
    logDebug('기록 저장 오류', error.toString());
    return { success: false, message: '기록 저장 중 오류가 발생했습니다: ' + error.toString() };
  }
}

// 개선된 getUserRecords 함수
function getUserRecords(userId) {
  try {
    console.log('=== getUserRecords 시작 ===');
    console.log('요청된 사용자 ID:', userId);
    
    // 입력 검증
    if (!userId) {
      console.log('❌ 사용자 ID 없음');
      return { 
        success: false, 
        message: '사용자 ID가 제공되지 않았습니다.',
        records: []
      };
    }

    // 스프레드시트 접근
    console.log('스프레드시트 접근 시도...');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const recordSheet = ss.getSheetByName('기록');
    
    if (!recordSheet) {
      console.log('❌ 기록 시트 없음');
      return { 
        success: false, 
        message: '기록 시트를 찾을 수 없습니다.',
        records: []
      };
    }

    console.log('✅ 기록 시트 접근 성공');

    // 데이터 범위 확인
    const lastRow = recordSheet.getLastRow();
    console.log('마지막 행:', lastRow);
    
    if (lastRow <= 1) {
      console.log('⚠️ 기록 데이터 없음');
      return { 
        success: true, 
        message: '등록된 기록이 없습니다.',
        records: []
      };
    }

    // 데이터 가져오기
    const data = recordSheet.getRange(1, 1, lastRow, 12).getValues();
    console.log('전체 데이터 행 수:', data.length);

    // 사용자 기록 찾기
    const userRecords = [];
    const targetUserId = String(userId).trim();
    
    console.log('찾는 사용자 ID:', targetUserId);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // 빈 행 스킵
      if (!row || row.length < 2 || !row[0] || !row[1]) {
        console.log(`행 ${i} 스킵 - 빈 데이터`);
        continue;
      }

      const rowUserId = String(row[1]).trim();
      console.log(`행 ${i}: "${rowUserId}" vs "${targetUserId}"`);

      if (rowUserId === targetUserId) {
        console.log(`✅ 매칭된 기록 발견 - 행 ${i}`);
        
        // Date 객체를 문자열로 변환하여 JSON 직렬화 문제 방지
        let timestamp;
        try {
          timestamp = row[2] ? new Date(row[2]).toISOString() : new Date().toISOString();
        } catch (e) {
          timestamp = new Date().toISOString();
        }
        
        const record = {
          id: row[0] || '',
          timestamp: timestamp,
          recordType: row[3] || '운동기록',
          squatWeight: parseFloat(row[4]) || 0,
          squatSuccess: row[5] || '실패',
          benchWeight: parseFloat(row[6]) || 0,
          benchSuccess: row[7] || '실패',
          deadWeight: parseFloat(row[8]) || 0,
          deadSuccess: row[9] || '실패',
          total: parseFloat(row[10]) || 0,
          rank: parseInt(row[11]) || 999
        };
        
        userRecords.push(record);
        console.log('추가된 기록:', record);
      }
    }

    // 시간순 정렬 (최신 먼저)
    userRecords.sort((a, b) => {
      try {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB.getTime() - dateA.getTime();
      } catch (e) {
        return 0; // 정렬 오류 시 순서 유지
      }
    });

    console.log('✅ 최종 결과:', {
      success: true,
      recordCount: userRecords.length,
      records: userRecords
    });

    const result = {
      success: true,
      message: userRecords.length > 0 ? 
        `${userRecords.length}개의 기록을 찾았습니다.` : 
        '등록된 기록이 없습니다.',
      records: userRecords
    };

    console.log('반환 결과:', result);
    return result;

  } catch (error) {
    console.error('❌ getUserRecords 오류:', error.toString());
    console.error('오류 상세:', error.stack);
    
    return { 
      success: false, 
      message: '기록 조회 중 오류가 발생했습니다: ' + error.toString(),
      records: [],
      error: error.toString()
    };
  }
}

function getUserStats(userId) {
  try {
    logDebug('사용자 통계 조회 시작', { userId });
    
    const recordSheet = getSheet('기록');
    const data = recordSheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return { success: true, stats: null };
    }
    
    const userRecords = data.slice(1).filter(row => row[1] === userId);
    
    if (userRecords.length === 0) {
      return { success: true, stats: null };
    }
    
    // 개인 최고 기록 계산
    let maxSquat = 0, maxBench = 0, maxDead = 0, maxTotal = 0;
    let totalRecords = userRecords.length;
    
    userRecords.forEach(record => {
      if (record[5] === '성공') maxSquat = Math.max(maxSquat, parseFloat(record[4]) || 0);
      if (record[7] === '성공') maxBench = Math.max(maxBench, parseFloat(record[6]) || 0);
      if (record[9] === '성공') maxDead = Math.max(maxDead, parseFloat(record[8]) || 0);
      maxTotal = Math.max(maxTotal, parseFloat(record[10]) || 0);
    });
    
    logDebug('사용자 통계 조회 성공', { maxSquat, maxBench, maxDead, maxTotal, totalRecords });
    
    return {
      success: true,
      stats: {
        maxSquat: maxSquat,
        maxBench: maxBench,
        maxDead: maxDead,
        maxTotal: maxTotal,
        totalRecords: totalRecords,
        recentRecord: userRecords[userRecords.length - 1]
      }
    };
    
  } catch (error) {
    logDebug('사용자 통계 조회 오류', error.toString());
    return { success: false, message: '통계 조회 중 오류가 발생했습니다: ' + error.toString() };
  }
}

// getAllRankings 함수 수정 - 명시적인 return 보장
function getAllRankings() {
  console.log('getAllRankings 함수 호출됨'); // 로그 추가
  
  try {
    logDebug('전체 랭킹 조회 시작');
    
    const recordSheet = getSheet('기록');
    const userSheet = getSheet('사용자');
    
    const recordData = recordSheet.getDataRange().getValues();
    const userData = userSheet.getDataRange().getValues();
    
    if (recordData.length <= 1 || userData.length <= 1) {
      logDebug('데이터가 없음 - 빈 배열 반환');
      return { success: true, rankings: [] };
    }
    
    // 사용자별 최고 기록 계산
    const userBestRecords = {};
    
    recordData.slice(1).forEach(record => {
      const userId = record[1];
      const total = parseFloat(record[10]) || 0;
      
      if (!userBestRecords[userId] || userBestRecords[userId].total < total) {
        userBestRecords[userId] = {
          userId: userId,
          total: total,
          timestamp: record[2]
        };
      }
    });
    
    // 사용자 정보와 합치기
    const rankings = Object.values(userBestRecords)
      .map(record => {
        const user = userData.slice(1).find(u => u[0] === record.userId);
        return {
          ...record,
          name: user ? user[1] : '알 수 없음',
          gender: user ? user[4] : '알 수 없음',
          trainer: user ? user[5] : '알 수 없음'
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((record, index) => ({
        ...record,
        rank: index + 1
      }));
    
    logDebug('전체 랭킹 조회 성공', { count: rankings.length });
    
    const result = { success: true, rankings: rankings };
    console.log('getAllRankings 반환값:', JSON.stringify(result)); // 반환값 로그
    
    return result; // 명시적 반환
    
  } catch (error) {
    logDebug('전체 랭킹 조회 오류', error.toString());
    console.error('getAllRankings 오류:', error); // 콘솔 에러 추가
    
    const errorResult = { 
      success: false, 
      message: '랭킹 조회 중 오류가 발생했습니다: ' + error.toString(),
      rankings: [] 
    };
    
    return errorResult; // 에러 시에도 명시적 반환
  }
}

function calculateRank(total, userId) {
  try {
    const recordSheet = getSheet('기록');
    const data = recordSheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return 1;
    }
    
    // 모든 사용자의 최고 기록 계산
    const userBestTotals = {};
    
    data.slice(1).forEach(row => {
      const recordUserId = row[1];
      const recordTotal = parseFloat(row[10]) || 0;
      
      if (!userBestTotals[recordUserId] || userBestTotals[recordUserId] < recordTotal) {
        userBestTotals[recordUserId] = recordTotal;
      }
    });
    
    // 현재 사용자의 기록보다 높은 기록 개수 + 1
    const higherScores = Object.values(userBestTotals).filter(userTotal => userTotal > total).length;
    return higherScores + 1;
    
  } catch (error) {
    logDebug('순위 계산 오류', error.toString());
    return 999;
  }
}

// Gemini AI 피드백 생성 - 개선된 버전
function generateAIFeedback(recordData, userStats, rank) {
  try {
    // 총합계 계산
    let total = 0;
    if (recordData.squatSuccess === '성공') total += parseFloat(recordData.squatWeight) || 0;
    if (recordData.benchSuccess === '성공') total += parseFloat(recordData.benchWeight) || 0;
    if (recordData.deadSuccess === '성공') total += parseFloat(recordData.deadWeight) || 0;
    
    // 성공/실패 분석
    const successCount = [recordData.squatSuccess, recordData.benchSuccess, recordData.deadSuccess]
      .filter(result => result === '성공').length;
    
    // 각 운동별 분석
    const exercises = [
      { name: '스쿼트', weight: recordData.squatWeight, success: recordData.squatSuccess },
      { name: '벤치프레스', weight: recordData.benchWeight, success: recordData.benchSuccess },
      { name: '데드리프트', weight: recordData.deadWeight, success: recordData.deadSuccess }
    ];
    
    const bestExercise = exercises
      .filter(ex => ex.success === '성공')
      .sort((a, b) => b.weight - a.weight)[0];
    
    const weakestExercise = exercises
      .filter(ex => ex.success === '실패')
      .sort((a, b) => a.weight - b.weight)[0];

    const prompt = `
당신은 전문 파워리프팅 코치입니다. 다음 운동 기록을 분석해서 상세하고 개인화된 피드백을 제공해주세요.

운동 기록:
- 스쿼트: ${recordData.squatWeight}kg (${recordData.squatSuccess})
- 벤치프레스: ${recordData.benchWeight}kg (${recordData.benchSuccess})
- 데드리프트: ${recordData.deadWeight}kg (${recordData.deadSuccess})
- 총합: ${total}kg
- 전체 순위: ${rank}위
- 성공한 운동: ${successCount}/3개

다음 4가지 섹션으로 구체적이고 실용적인 피드백을 작성해주세요:

1. **총평** (2-3문장): 
   - 총 기록과 순위에 대한 평가
   - 전체적인 수준 평가 (초급자: ~200kg, 중급자: 200-350kg, 고급자: 350-500kg, 엘리트: 500kg+)
   - 성공률에 대한 코멘트

2. **강점 분석** (2문장):
   - 가장 좋았던 운동과 구체적인 칭찬
   - 특별히 인상적인 부분이나 밸런스 언급

3. **개선점** (2문장):
   - 실패한 운동이 있다면 구체적인 개선 방향
   - 3대 운동 밸런스나 약점 보완 방법

4. **다음 목표** (2문장):
   - 구체적인 다음 목표 중량 제시
   - 단계별 훈련 접근법 제안

각 섹션을 명확히 구분하고, 운동하는 사람이 동기부여를 받을 수 있도록 긍정적이면서도 전문적인 조언을 해주세요.
전체 길이는 300자 내외로 작성해주세요.
`;

    const response = UrlFetchApp.fetch(GEMINI_API_URL + '?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.8,
          topP: 0.9
        }
      })
    });
    
    const data = JSON.parse(response.getContentText());
    
    if (data.candidates && data.candidates[0]) {
      return {
        success: true,
        feedback: data.candidates[0].content.parts[0].text.trim()
      };
    } else {
      throw new Error('AI 응답 형식이 올바르지 않습니다.');
    }
    
  } catch (error) {
    logDebug('AI 피드백 생성 오류', error.toString());
    
    // 개선된 기본 피드백 생성
    let total = 0;
    if (recordData.squatSuccess === '성공') total += parseFloat(recordData.squatWeight) || 0;
    if (recordData.benchSuccess === '성공') total += parseFloat(recordData.benchWeight) || 0;
    if (recordData.deadSuccess === '성공') total += parseFloat(recordData.deadWeight) || 0;
    
    const successCount = [recordData.squatSuccess, recordData.benchSuccess, recordData.deadSuccess]
      .filter(result => result === '성공').length;
    
    let level = '';
    if (total >= 500) level = '엘리트';
    else if (total >= 350) level = '고급자';
    else if (total >= 200) level = '중급자';
    else level = '초급자';
    
    // 최고 기록과 약점 분석
    const exercises = [
      { name: '스쿼트', weight: recordData.squatWeight, success: recordData.squatSuccess },
      { name: '벤치프레스', weight: recordData.benchWeight, success: recordData.benchSuccess },
      { name: '데드리프트', weight: recordData.deadWeight, success: recordData.deadSuccess }
    ];
    
    const successfulExercises = exercises.filter(ex => ex.success === '성공');
    const bestExercise = successfulExercises.length > 0 ? 
      successfulExercises.sort((a, b) => b.weight - a.weight)[0] : null;
    
    const failedExercises = exercises.filter(ex => ex.success === '실패');
    
    let fallbackFeedback = `총 ${total}kg으로 ${rank}위를 달성하며 ${level} 수준의 실력을 보여주셨습니다! `;
    fallbackFeedback += `3개 운동 중 ${successCount}개를 성공하여 `;
    
    if (successCount === 3) {
      fallbackFeedback += `완벽한 기록을 달성했습니다. `;
    } else if (successCount === 2) {
      fallbackFeedback += `안정적인 기록을 보여주었습니다. `;
    } else {
      fallbackFeedback += `다음에는 더 좋은 결과를 기대해봅니다. `;
    }
    
    if (bestExercise) {
      fallbackFeedback += `특히 ${bestExercise.name} ${bestExercise.weight}kg이 인상적입니다. `;
    }
    
    if (failedExercises.length > 0) {
      const weakest = failedExercises[0].name;
      fallbackFeedback += `${weakest} 훈련에 더 집중해보세요. `;
    } else {
      fallbackFeedback += `균형잡힌 발전을 보여주고 있습니다. `;
    }
    
    const nextGoal = Math.ceil(total / 25) * 25 + 25;
    fallbackFeedback += `다음 목표는 총합 ${nextGoal}kg입니다!`;
    
    return {
      success: true,
      feedback: fallbackFeedback
    };
  }
}

// 테스트 및 디버깅 함수들
function test() {
  console.log('Apps Script 설정 완료');
}

// 웹앱 테스트 함수
function testWebAppResponse() {
  console.log('=== 웹앱 응답 테스트 ===');
  
  const testResponse = {
    success: true,
    message: '테스트 응답입니다.',
    records: [
      {
        id: 'TEST_001',
        timestamp: new Date().toISOString(),
        recordType: '테스트기록',
        squatWeight: 50,
        squatSuccess: '성공',
        benchWeight: 40,
        benchSuccess: '성공',
        deadWeight: 60,
        deadSuccess: '성공',
        total: 150,
        rank: 1
      }
    ]
  };
  
  console.log('테스트 응답:', testResponse);
  return testResponse;
}

// 시트 연결 테스트
function testSheetConnection() {
  try {
    const userSheet = getSheet('사용자');
    const recordSheet = getSheet('기록');
    
    console.log('사용자 시트 연결 성공:', userSheet.getName());
    console.log('기록 시트 연결 성공:', recordSheet.getName());
    
    // 시트 데이터 확인
    const userData = userSheet.getDataRange().getValues();
    const recordData = recordSheet.getDataRange().getValues();
    
    console.log('사용자 데이터 행 수:', userData.length);
    console.log('기록 데이터 행 수:', recordData.length);
    
    return { 
      success: true, 
      message: '시트 연결 성공',
      userRows: userData.length,
      recordRows: recordData.length
    };
  } catch (error) {
    console.error('시트 연결 실패:', error.toString());
    return { success: false, message: '시트 연결 실패: ' + error.toString() };
  }
}

// 시트 생성 및 초기화
function createMissingSheets() {
  console.log('=== 누락된 시트 생성 ===');
  
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // 기록 시트 확인 및 생성
    let recordSheet = ss.getSheetByName('기록');
    if (!recordSheet) {
      console.log('기록 시트 생성 중...');
      recordSheet = ss.insertSheet('기록');
      
      // 헤더 추가
      recordSheet.getRange(1, 1, 1, 12).setValues([
        ['기록ID', '사용자ID', '타임스탬프', '기록유형', '스쿼트중량', '스쿼트성공', '벤치중량', '벤치성공', '데드중량', '데드성공', '총합계', '전체순위']
      ]);
      
      console.log('✅ 기록 시트 생성 완료');
    } else {
      console.log('기록 시트가 이미 존재함');
      
      // 헤더 확인
      if (recordSheet.getLastRow() === 0) {
        console.log('헤더 추가 중...');
        recordSheet.getRange(1, 1, 1, 12).setValues([
          ['기록ID', '사용자ID', '타임스탬프', '기록유형', '스쿼트중량', '스쿼트성공', '벤치중량', '벤치성공', '데드중량', '데드성공', '총합계', '전체순위']
        ]);
        console.log('✅ 헤더 추가 완료');
      }
    }
    
    // 사용자 시트 확인
    let userSheet = ss.getSheetByName('사용자');
    if (!userSheet) {
      console.log('사용자 시트 생성 중...');
      userSheet = ss.insertSheet('사용자');
      
      // 헤더 추가
      userSheet.getRange(1, 1, 1, 8).setValues([
        ['사용자ID', '이름', '휴대폰번호', '비밀번호', '성별', '트레이너', '가입일', '최근접속일']
      ]);
      
      console.log('✅ 사용자 시트 생성 완료');
    }
    
    return { success: true, message: '시트 설정 완료' };
    
  } catch (error) {
    console.error('❌ 시트 생성 실패:', error.toString());
    return { success: false, message: error.toString() };
  }
}

function debugRankings() {
  console.log('=== 디버깅 시작 ===');
  
  try {
    // 시트 접근 테스트
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetNames = ss.getSheets().map(s => s.getName());
    console.log('📋 전체 시트 목록:', sheetNames);
    
    // 기록 시트 확인
    const recordSheet = ss.getSheetByName('기록');
    if (recordSheet) {
      const lastRow = recordSheet.getLastRow();
      console.log('📊 기록 시트 행 수:', lastRow);
      
      if (lastRow > 0) {
        const sampleData = recordSheet.getRange(1, 1, Math.min(3, lastRow), 12).getValues();
        console.log('📝 기록 데이터 샘플:', sampleData);
      }
    } else {
      console.log('❌ 기록 시트를 찾을 수 없음');
    }
    
    // 사용자 시트 확인  
    const userSheet = ss.getSheetByName('사용자');
    if (userSheet) {
      const lastRow = userSheet.getLastRow();
      console.log('👥 사용자 시트 행 수:', lastRow);
      
      if (lastRow > 0) {
        const sampleData = userSheet.getRange(1, 1, Math.min(3, lastRow), 8).getValues();
        console.log('👤 사용자 데이터 샘플:', sampleData);
      }
    } else {
      console.log('❌ 사용자 시트를 찾을 수 없음');
    }
    
    // 실제 순위 함수 테스트
    console.log('🏆 순위 함수 실행 중...');
    const rankResult = getAllRankings();
    console.log('🏆 순위 결과:', rankResult);
    
    return {
      success: true,
      message: '디버깅 완료',
      sheetNames: sheetNames,
      rankResult: rankResult
    };
    
  } catch (error) {
    console.error('❌ 디버깅 오류:', error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}
