//========================
  // 20251129 优化时间调用，contract临期到期显示逻辑，UI模态框功能健壮
//========================

document.addEventListener('DOMContentLoaded', () => {

            // =================================================================================
            // TIMEZONE & DATE HELPERS
            // =================================================================================
            function padZero(num) {
        return num < 10 ? '0' + num : String(num);
    }

    // 把任意本地时间转为北京时间 Date 对象（通过 UTC +8h）
    function toBeijingDate(dateObj) {
        const d = dateObj instanceof Date ? dateObj : new Date();
        const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000); // ms
        const beijingTime = new Date(utcTime + 8 * 3600 * 1000);
        return beijingTime;
    }

    // === 北京时间字符串（仅时间，24小时制）===
function getBeijingTimeString() {
  // 优先使用 Intl
  try {
    const f = new Intl.DateTimeFormat('en-US', { // 使用 en-US 保证 HH:mm:ss 格式
        timeZone: 'Asia/Shanghai',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
    return f.format(new Date());
  } catch (e) {
    // 回退到手动格式化
    const bj = toBeijingDate(new Date());
    return `${padZero(bj.getHours())}:${padZero(bj.getMinutes())}:${padZero(bj.getSeconds())}`;
  }
}

// 返回 YYYY-MM-DD，优先用 Intl（如果可用且支持 timeZone），否则回退到 toBeijingDate 手动格式化
    function getBeijingDateString() {
        try {
            if (typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function') {
                // 有些旧浏览器会在这个处抛异常或忽视 timeZone；包在 try 中安全
                const f = new Intl.DateTimeFormat('fr-CA', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric', month: '2-digit', day: '2-digit'
                });
                const s = f.format(new Date());
                if (typeof s === 'string' && /\d{4}-\d{2}-\d{2}/.test(s)) {
                    return s; // Intl 格式看起来 OK（fr-CA => YYYY-MM-DD）
                }
            }
        } catch (e) {
            // 忽略，走回退逻辑
            // console.warn('Intl date formatting unavailable or failed, falling back to manual Beijing time.', e);
        }
        const bj = toBeijingDate(new Date());
        return `${bj.getFullYear()}-${padZero(bj.getMonth() + 1)}-${padZero(bj.getDate())}`;
    }

    // === 共用：将两个 <input type="date"> 归一化为 [start, end] 区间 ===
// - 规则：如果两个都空，则返回今天；如果只设置了一个，则用该值补到另一个。
function normalizeDateRange(startInput, endInput) {
  const today = getBeijingDateString();
  let start = (startInput && startInput.value) || '';
  let end   = (endInput && endInput.value) || '';

  if (!start && !end) {
    start = end = today;
  } else if (start && !end) {
    end = start;
  } else if (end && !start) {
    start = end;
  }
  return { start, end };
}

// === 全局星期常量（统一复用） ===
const WEEKDAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

// === 共用：根据开始和结束日期生成区间标签 ===
// - 如果 start == end，则返回单日；否则返回 "start 至 end"
function formatDateRangeLabel(start, end) {
  return start === end ? start : `${start} 至 ${end}`;
}

// === 公共：清空 Supabase 表（兼容 holiday_config 的特殊删除） ===
async function clearSupabaseTable(client, tableName) {
  if (tableName === 'holiday_config') {
    const { error } = await client.from(tableName).delete().eq('id', 1);
    if (error) throw new Error(`Failed to clear table ${tableName}: ${error.message}`);
    return;
  }
  const { error } = await client.from(tableName).delete().neq('id', 'a-value-that-never-exists');
  if (error) throw new Error(`Failed to clear table ${tableName}: ${error.message}`);
}

// === 共用：学生卡片标题拼接 ===
function formatStudentHeader(name, grade) {
  return grade ? `${name} (${grade})` : name;
}


    // 更新页面时钟（修复回退逻辑）
function updateClock() {
  const clockEl = document.getElementById('datetime-display');
  if (!clockEl) return;

  try {
    // [保持现有的 Intl.formatToParts 逻辑不变...]
    if (typeof Intl !== 'undefined' &&
        typeof Intl.DateTimeFormat === 'function' &&
        typeof Intl.DateTimeFormat.prototype.formatToParts === 'function') {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'long', hour12: false
      };
      const formatter = new Intl.DateTimeFormat('zh-CN', options);
      const parts = formatter.formatToParts(now);
      const partMap = {};
      parts.forEach(p => { partMap[p.type] = p.value; });

      // 显示格式：2025-11-16 星期日 11:10:30
      clockEl.textContent =
        `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.weekday} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
      return;
    }
  } catch (e) {
    // 如果 Intl.formatToParts 不可用，进入 fallback
  }

  // === (已修复) 回退实现 ===
  const bj = toBeijingDate(new Date()); // 1. 首先获取北京时间 Date 对象
  
  const dateStr = `${bj.getFullYear()}-${padZero(bj.getMonth() + 1)}-${padZero(bj.getDate())}`; // 2. 从 bj 对象取日期
  const timeStr = `${padZero(bj.getHours())}:${padZero(bj.getMinutes())}:${padZero(bj.getSeconds())}`; // 3. 从 bj 对象取时间
  const weekdayStr = WEEKDAYS[bj.getDay()];  // 4. 从 bj 对象取星期

  clockEl.textContent = `${dateStr} ${weekdayStr} ${timeStr}`;
}


    // 页面加载时第一次更新并设置定时器（保留现有逻辑）
    updateClock();
    setInterval(updateClock, 1000);

    // 封装 domtoimage 调用，自动忽略跨域 CSS 报错
function safeDomToImage(node, options = {}) {
    return domtoimage.toBlob(node, options)
        .catch(err => {
            if (err && err.name === 'SecurityError') {
                console.warn('domtoimage: 跨域样式表无法访问，已自动跳过。');
                return new Blob([]); // 返回空 Blob，避免调用链中断
            }
            throw err;
        });
}


    // 额外保护：在设置日期输入值的地方（初始化）做 try/catch 保证不会因为异常卡住：
    // 示例（你的 HomeworkModule.init() 中已存在 this.filterDateInput.value = getBeijingDateString();）
    // 请把那行改为：
    // try { this.filterDateInput.value = getBeijingDateString(); } catch (e) { console.error('设置过滤日期失败', e); }
            // =================================================================================
            // INDEXEDDB MODULE (Replaces localStorage)
            // =================================================================================
            // === (新) 重构版 IDB 模块，支持多表隔离 ===
            const IDBModule = {
                db: null,
                DB_NAME: 'HomeworkPlatformDB',
                DB_VERSION: 2, // 必须升级版本以触发 onupgradeneeded

                STORES: {
                    APP: 'appState',       // 用于作业/学生/科目
                    CONTRACT: 'contractState' // 用于合约/节假日
                },

                KEYS: {
                    APP: 'currentState',
                    CONTRACT: 'currentContractState'
                },

                init() {
                    return new Promise((resolve, reject) => {
                        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

                        request.onupgradeneeded = (event) => {
                            const db = event.target.result;
                            
                            // 1. 检查并创建 appState (作业)
                            if (!db.objectStoreNames.contains(this.STORES.APP)) {
                                db.createObjectStore(this.STORES.APP);
                                console.log(`Object store ${this.STORES.APP} created.`);
                            }
                            
                            // 2. 检查并创建 contractState (合约)
                            if (!db.objectStoreNames.contains(this.STORES.CONTRACT)) {
                                db.createObjectStore(this.STORES.CONTRACT);
                                console.log(`Object store ${this.STORES.CONTRACT} created.`);
                            }
                        };

                        request.onsuccess = (event) => {
                            this.db = event.target.result;
                            console.log("IndexedDB initialized successfully (V2).");
                            resolve();
                        };

                        request.onerror = (event) => {
                            console.error("IndexedDB error:", event.target.errorCode);
                            reject(event.target.error);
                        };
                    });
                },

                /**
                 * (新) 从指定的存储中获取数据
                 * @param {string} storeName - 'appState' 或 'contractState'
                 */
                getState(storeName) {
                    return new Promise((resolve, reject) => {
                        if (!this.db) return reject("DB not initialized");
                        if (!Object.values(this.STORES).includes(storeName)) {
                            return reject(`Invalid store name: ${storeName}`);
                        }

                        const transaction = this.db.transaction([storeName], 'readonly');
                        const store = transaction.objectStore(storeName);
                        
                        // 确定要获取的 Key
                        const key = (storeName === this.STORES.APP) ? this.KEYS.APP : this.KEYS.CONTRACT;
                        
                        const request = store.get(key);

                        request.onsuccess = () => {
                            resolve(request.result);
                        };
                        request.onerror = (event) => {
                            reject(event.target.error);
                        };
                    });
                },

                /**
                 * (新) 保存数据到指定的存储
                 * @param {string} storeName - 'appState' 或 'contractState'
                 * @param {any} state - 要保存的数据
                 */
                saveState(storeName, state) {
                    return new Promise((resolve, reject) => {
                        if (!this.db) return reject("DB not initialized");
                        if (!Object.values(this.STORES).includes(storeName)) {
                            return reject(`Invalid store name: ${storeName}`);
                        }

                        const transaction = this.db.transaction([storeName], 'readwrite');
                        const store = transaction.objectStore(storeName);
                        
                        // 确定要使用的 Key
                        const key = (storeName === this.STORES.APP) ? this.KEYS.APP : this.KEYS.CONTRACT;

                        const request = store.put(state, key);

                        transaction.oncomplete = () => {
                            resolve();
                        };
                        transaction.onerror = (event) => {
                            reject(event.target.error);
                        };
                    });
                },

                /**
                 * (新) 清空指定存储的数据
                 * @param {string} storeName - 'appState' 或 'contractState'
                 */
                clearState(storeName) {
                    return new Promise((resolve, reject) => {
                        if (!this.db) return reject("DB not initialized");
                        if (!Object.values(this.STORES).includes(storeName)) {
                            return reject(`Invalid store name: ${storeName}`);
                        }
                        
                        const transaction = this.db.transaction([storeName], 'readwrite');
                        const store = transaction.objectStore(storeName);
                        const request = store.clear(); // 只清空这个表
                        
                        transaction.oncomplete = () => {
                            resolve();
                        };
                        transaction.onerror = (event) => {
                            reject(event.target.error);
                        };
                    });
                }
            };
            // === IDBModule 替换结束 ===

            // =================================================================================
            // SUPABASE SYNC MODULE (*** REFACTORED FOR INCREMENTAL + SOFT-DELETE ***)
            // =================================================================================
            const SupabaseSyncModule = {
                supabase: null,
                isInitialized: false,
                isAppLoaded: false, // <-- (新) 添加此标志
                isOnline: false,
                isSyncing: false,
                pendingSync: false,
                syncRetryCount: 0,
                maxRetries: 3,

                init() {
                    // Initialize Supabase client
                    this.supabase = supabase.createClient(
                        'https://hxcnuktwwmoilzsdlzdh.supabase.co', // Replace with your Supabase URL
                        'sb_publishable_Vm9roWkthCCrTFmSvfDjGg_Z-Z0UWGO' // Replace with your Supabase Anon Key
                    );

                    // Check network status
                    this.checkNetworkStatus();

                    // (新) 从 sessionStorage 恢复 pendingSync 状态
                    // 这确保了 "待上传" 状态能在页面刷新后存活
                    this.pendingSync = sessionStorage.getItem('pendingSync') === 'true';
                    
                    // Listen for network status changes
                    window.addEventListener('online', () => this.handleNetworkOnline());
                    window.addEventListener('offline', () => this.handleNetworkOffline());
                    
                    // Periodically check network status
                    setInterval(() => this.checkNetworkStatus(), 30000);
                    
                    this.isInitialized = true;
                    console.log("Supabase sync module initialized (Incremental + Soft Delete).");
                },
                
                

                checkNetworkStatus() {
                    const wasOnline = this.isOnline;
                    this.isOnline = navigator.onLine;
                    
                    if (this.isOnline && !wasOnline) {
                        this.handleNetworkOnline();
                    } else if (!this.isOnline && wasOnline) {
                        this.handleNetworkOffline();
                    }
                },

                // (这是新的代码，请完整替换)
handleNetworkOnline() {
    this.isOnline = true;
    this.updateNetworkStatus('online', '在线');

    // (关键修复)
    // 只有在 App 状态 (IndexedDB) 加载完毕后，才允许执行任何网络操作
    if (!this.isAppLoaded) {
        return; // 立即退出，防止在 App.loadState() 之前运行
    }

    // handleNetworkOnline 的*唯一*职责应该是触发“待上传”的同步。
    // “下载/恢复”逻辑 (syncFromCloudIfNeeded) 应该只在 initializeApp 中被调用。
    if (this.pendingSync) {
        this.syncToCloud(); // 触发待办的上传
    }
    
    // (已移除) 删除了 else 分支中的 syncFromCloudIfNeeded() 调用
},

                handleNetworkOffline() {
                    this.isOnline = false;
                    this.updateNetworkStatus('offline', '离线中');
                },

                updateNetworkStatus(status, text) {
                    const statusElement = document.getElementById('networkStatus');
                    const textElement = document.getElementById('networkStatusText');
                    
                    if (statusElement && textElement) {
                        statusElement.className = `network-status ${status}`;
                        textElement.textContent = text;
                        statusElement.style.display = 'block';
                    }
                },

                // =================================================================================
                // (P7 修复) 2. 调度器 (Scheduler)
                // 职责：管理“锁”(isSyncing) 和“队列”(pendingSync)。
                //       保证同一时间只有一个“执行者”在运行。
                //       在执行者失败时，它负责重试。
                // =================================================================================
                async syncToCloud() {
                    // 1. 检查“重入”：如果一个同步任务已在运行，设置“待处理”标志
                    if (this.isSyncing) {
                        this.pendingSync = true;
                        sessionStorage.setItem('pendingSync', 'true');
                        return;
                    }

                    // 2. 锁定：标记同步开始 (在 try 之外)
                    this.isSyncing = true;
                    this.updateNetworkStatus('syncing', '同步中...');
                    let success = false;

                    // 3. (关键修复) 使用 try...finally 保证锁一定被释放
                    try {
                        // 4. 执行：调用“执行者”
                        success = await this._executeSync();
                        
                    } catch (e) {
                        // 5. 如果 _executeSync 失败 (例如网络错误)，在这里捕获它
                        console.error("Sync task failed, scheduler will retry:", e);
                        success = false;

                        // (P7 关键) “执行者”失败了，调度器负责重试
                        if (this.syncRetryCount < this.maxRetries) {
                            this.syncRetryCount++;
                            this.updateNetworkStatus('error', `同步失败，重试中 (${this.syncRetryCount}/${this.maxRetries})`);
                            // 立即安排一次“重试”
                            // 注意：因为 isSyncing 仍为 true (直到 finally 才释放)，
                            // 这次调用会安全地设置 pendingSync = true。
                            this.syncToCloud(); 
                        } else {
                            this.updateNetworkStatus('error', '同步失败');
                        }
                        
                    } finally {
                        // 6. 释放锁：(关键) 无论成功还是失败，此块总会执行
                        this.isSyncing = false;

                        // 7. 链式反应：(关键) 检查在本次同步 *期间* 是否有新的改动
                        if (this.pendingSync) {
                            // 清除标志
                            this.pendingSync = false;
                            sessionStorage.removeItem('pendingSync');
                            
                            // 立即安排下一次同步（绕过500ms防抖）
                            setTimeout(() => this.syncToCloud(), 10); 
                        }
                        
                        // 8. (P7 关键) 只有在 *成功* 且 *没有待处理* 任务时，才重置UI
                        else if (success) {
                            this.syncRetryCount = 0; // 成功后重置重试计数
                            this.updateNetworkStatus('online', '同步成功');
                            setTimeout(() => {
                                if (this.isOnline) this.updateNetworkStatus('online', '在线');
                            }, 2000);
                        }
                    }
                },

                async _executeSync() {
            let success = false;
            // this.isSyncing = true; // 设置同步标志
            // this.updateNetworkStatus('syncing', '同步中...');
            
            // 1. (关键修复) 创建一个*深度快照* (Deep Snapshot)
            //    这可以防止在 "await" 期间，App.state 被后续操作篡改。
            //    JSON.parse(JSON.stringify(...)) 是最简单、最可靠的深拷贝方法。
            // 1. (P5 修复) 创建深度快照 (您的代码中已有，保持不变)
                    const appStateSnapshot = JSON.parse(JSON.stringify(App.state));
                    const contractStateSnapshot = JSON.parse(JSON.stringify(
                        ContractModule.state || { contracts: [], holidayConfig: { holidays: [], workdays: [] } }
                    ));

                    // 2. 只使用快照数据 (您的代码中已有，保持不变)
                    const { students, subjects, homeworks } = appStateSnapshot;
                    const { contracts, holidayConfig } = contractStateSnapshot;

            try {
                // =================================================================
                // === 核心改造：移除“清空所有表数据”的步骤 ===
                // const tableNames = ['homeworks', 'contracts', 'subjects', 'students', 'holiday_config'];
                // for (const tableName of tableNames) {
                //   await clearSupabaseTable(this.supabase, tableName);
                // }
                // === 改造结束 ===
                // =================================================================


                // B. 插入新数据 (两阶段插入，确保外键顺序)
                // (注意：upsert 现在会智能处理增、改、和软删除)
                const nonDependentPromises = [];
                // *** 修复点：新增此行，声明 dependentPromises ***
                const dependentPromises = [];
                
                // 1. 优先级最高：students 表
                // (如果学生被软删除，is_deleted = true 会被同步上去)
                if (students.length > 0) nonDependentPromises.push(this.supabase.from('students').upsert(students, { onConflict: 'id' }));

                // 2. 优先级次之：subjects 和 holiday_config
                if (subjects.length > 0) nonDependentPromises.push(this.supabase.from('subjects').upsert(subjects, { onConflict: 'id' }));
                if (holidayConfig) {
                     // holiday_config 不使用软删除，它总是全量覆盖 id: 1
                     nonDependentPromises.push(this.supabase.from('holiday_config').upsert({ id: 1, config_data: holidayConfig }, { onConflict: 'id' }));
                }

                // 运行非依赖 Promise
                let results = await Promise.all(nonDependentPromises);
                results.forEach(result => {
                    if (result.error) throw new Error(`Data insertion failed: ${result.error.message}`);
                });

                // 3. 优先级最低：homeworks 和 contracts (依赖 students 表)
                if (homeworks.length > 0) dependentPromises.push(this.supabase.from('homeworks').upsert(homeworks, { onConflict: 'id' }));
                if (contracts && contracts.length > 0) dependentPromises.push(this.supabase.from('contracts').upsert(contracts, { onConflict: 'id' }));

                // 运行所有依赖 Promise
                results = await Promise.all(dependentPromises);
                results.forEach(result => {
                    if (result.error) throw new Error(`Data insertion failed: ${result.error.message}`);
                });
                
                // 成功处理
                this.updateNetworkStatus('online', '同步成功');
                console.log('Data synced to cloud successfully (Incremental).');
                this.syncRetryCount = 0; // 重置重试计数
                // this.pendingSync = false; // <-- (新) 重置内存标志
                // sessionStorage.removeItem('pendingSync'); // <-- (新) 移除持久化标志
                success = true;

            } catch (error) {
                // 失败处理
                console.error('Failed to sync to cloud:', error);
                this.updateNetworkStatus('error', '同步失败');
                
                // (关键修复) 我们不再自动重试，因为这会与调度器冲突
                        // 我们只更新UI并抛出错误，调度器会捕获它
                        if (this.syncRetryCount < this.maxRetries) {
                            this.syncRetryCount++;
                            this.updateNetworkStatus('error', `同步失败 (${this.syncRetryCount}/${this.maxRetries})，将随下次更改重试`);
                        } else {
                            this.updateNetworkStatus('error', '同步失败');
                        }
                        success = false;
                        
                        // (关键) 必须抛出错误，通知调度器 (syncToCloud) 此任务已失败
                        throw error;
            } finally {
                        // (关键修复) “执行者”的 finally 块现在非常干净
                        // 它不再管理 'isSyncing' 或 'pendingSync'
                        
                        // (关键修复) 移除了: this.isSyncing = false;
                        // (关键修复) 移除了: if (this.pendingSync) { ... }
                        // (关键修复) 移除了: setTimeout(() => this.syncToCloud(), 10);
                        
                        if (success) {
                            // 如果成功，2秒后重置UI
                            setTimeout(() => {
                                if (this.isOnline) this.updateNetworkStatus('online', '在线');
                            }, 2000);
                        }
                        
                        // (关键修复) 移除了: return success;
                        // 成功时，函数正常返回
                        // 失败时，'catch' 块中的 'throw error' 会处理
                    }
                },

                async syncFromCloudIfNeeded() {
                    if (App.state.students.length === 0 && App.state.subjects.length === 0 && App.state.homeworks.length === 0) {
                        const wasReset = sessionStorage.getItem('systemWasReset');
                        if (!wasReset) {
                            await this.syncFromCloud();
                        }
                    }
                },
                
                // === 核心改造：增加 softDeleteColumn 参数 ===
                // Helper function to fetch all rows from a table, handling pagination
                async fetchAllFromTable(tableName, softDeleteColumn = null, sortOptions = null) {
                    const allRows = [];
                    const pageSize = 1000;
                    let page = 0;

                    while (true) {
                        
                        // === 改造点：动态构建查询 ===
                        let query = this.supabase.from(tableName).select('*');
                        if (softDeleteColumn) {
                            // 只拉取 is_deleted = false 的数据
                            query = query.eq(softDeleteColumn, false);
                        }
                        // === 改造结束 ===

                        // === 修复：添加排序逻辑 ===
                    if (sortOptions && sortOptions.column) {
                        // 1. 按请求的列排序
                        query = query.order(sortOptions.column, { 
                            ascending: sortOptions.ascending !== false // 默认为 true
                        });

                        // 2. (关键) 再按 'id' 排序，以确保分页顺序 100% 稳定
                        //    防止因 task_order 等字段不唯一而导致的分页错误
                        query = query.order('id', { ascending: true });
                    }
                    // === 修复结束 ===

                        const { data, error } = await query
                            .range(page * pageSize, (page + 1) * pageSize - 1);
                        
                        if (error) throw error;
                        
                        if (data) {
                            allRows.push(...data);
                        }
                        
                        // If fewer than pageSize rows are returned, it's the last page
                        if (!data || data.length < pageSize) {
                            break;
                        }
                        
                        page++;
                    }
                    return allRows;
                },

                async syncFromCloud() {
                    if (!this.isOnline) return false;

                    this.updateNetworkStatus('syncing', '从云端恢复...');
                    
                    try {
                        // === 核心改造：拉取数据时传入 'is_deleted' 列名 ===
                        const [students, subjects, homeworks, contracts, holidayConfigResult] = await Promise.all([
                            this.fetchAllFromTable('students', 'is_deleted'),
                            this.fetchAllFromTable('subjects', 'is_deleted'),
                            this.fetchAllFromTable('homeworks', 'is_deleted', { column: 'task_order', ascending: true }),
                            this.fetchAllFromTable('contracts', 'is_deleted'),
                            this.fetchAllFromTable('holiday_config') // holiday_config 没有软删除
                        ]);
                        // === 改造结束 ===
                        
                        // === NEW: 解析 holidayConfig ===
                        const holidayConfig = (holidayConfigResult && holidayConfigResult.length > 0)
                            ? holidayConfigResult[0].config_data
                            : { holidays: [], workdays: [], workingDays: 22 }; // 默认值
                        
                        // === MODIFIED: 将数据分发到 App.state 和 ContractModule.state ===
                        
                        // 1. 组合作业数据
                        const appData = { 
                            students, 
                            subjects, 
                            homeworks
                        };
                        
                        // 2. 组合合约数据
                        const contractData = {
                            contracts: contracts || [],
                            holidayConfig: holidayConfig
                        };

                        if (appData.students.length > 0 || appData.subjects.length > 0 || appData.homeworks.length > 0 || contractData.contracts.length > 0) {
                            
                            // 3. 分别赋值和保存
                            App.state = appData;
                            ContractModule.state = contractData; // 赋值
                            
                            
                            // === 修复：绕过 App.saveState()，直接调用 IDBModule ===
                        // 这样做可以防止 saveState 内部的 triggerSync() 被调用
                        try {
                            await IDBModule.saveState(IDBModule.STORES.APP, App.state);
                            await IDBModule.saveState(IDBModule.STORES.CONTRACT, ContractModule.state);
                        } catch (e) {
                            console.error("syncFromCloud: Failed to save restored state to IndexedDB", e);
                        }
                        // === 修复结束 ===
                        
                            App.renderAll();
                            
                            this.updateNetworkStatus('online', '数据已恢复');
                            console.log('Data restored from cloud (split stores) successfully.');
                        } else {
                            sessionStorage.setItem('systemWasReset', 'true');
                            console.log('Cloud data is empty, skipping restore.');
                        }
                        
                        setTimeout(() => {
                            if (this.isOnline) this.updateNetworkStatus('online', '在线');
                        }, 2000);
                        
                        return true;
                    } catch (error) {
                        console.error('Failed to restore data from cloud:', error);
                        this.updateNetworkStatus('error', '恢复失败');
                        
                        setTimeout(() => {
                            if (this.isOnline) this.updateNetworkStatus('online', '在线');
                        }, 5000);
                        
                        return false;
                    }
                },

                triggerSync() {
                    if (this.isInitialized) {
                        // 无论当前是否正在同步，都清除上一个500ms的计时器
                        clearTimeout(this.syncTimeout);
                        
                        // 总是设置一个新的500ms计时器。
                        // 这会将连续的本地保存“防抖”(debounce)
                        // 合并为 500ms 后的 *一次* syncToCloud() (调度器) 调用。
                        this.syncTimeout = setTimeout(() => this.syncToCloud(), 500);
                    }
                }
            };
            
            // Channel for cross-tab communication
            const channel = new BroadcastChannel('homeworkPlatformSync');

            // =================================================================================
            // APP CORE & DATA MANAGEMENT
            // =================================================================================
            const App = {

                // 新增：存储当前用户邮箱
                currentUserEmail: null, 
    
                // 新增：判断是否为超级管理员 (用于决定头像旁的标签显示什么)
                isSuperAdmin() {
                return this.currentUserEmail === 'zjq29@126.com';
                },

                // === MODIFIED: 移除 contracts 和 holidayConfig ===
                state: { students: [], subjects: [], homeworks: [] },
                grades: ['幼儿园','一年级','二年级','三年级','四年级','五年级','六年级','七年级','八年级','九年级'],


                async init() {
                    // === MODIFIED: 
                    // 1. IDBModule.init() 现在会设置好 *两个* 表
                    // 2. 我们在此处只加载 'appState'
                    // 3. ContractModule.init() 将在稍后加载 'contractState'
                    // ===
                    await IDBModule.init(); 
                    await this.loadState(); // (已修改) 只加载 appState
                    this.registerEventListeners();
                    this.renderAll();
                    
                    ContractModule.init(); // (重要) ContractModule.init() 必须在 IDBModule.init() 之后
                    console.log("家庭作业监督平台已初始化。");
                },
                
                async loadState() {
                    try {
                        // === MODIFIED: 明确从 'appState' 加载 ===
                        const savedState = await IDBModule.getState(IDBModule.STORES.APP);
                        // === MODIFICATION END ===
                        
                        if (savedState) {
                            this.state = savedState;
                            // (移除向后兼容检查，因为 state 现在是隔离的)
                        } else {
                            // === MODIFIED: 默认 state 只包含作业数据 ===
                            this.state = { students: [], subjects: [], homeworks: [] };
                        }
                    } catch (error) {
                        console.error("Failed to load state from IndexedDB (appState)", error);
                        this.state = { students: [], subjects: [], homeworks: [] };
                    }
                },

                async saveState() { 
                    try {
                        // === MODIFIED: 明确保存到 'appState' ===
                        await IDBModule.saveState(IDBModule.STORES.APP, this.state);
                        // === MODIFICATION END ===
                        
                        channel.postMessage({ type: 'STATE_UPDATED' });
                        SupabaseSyncModule.triggerSync();
                    } catch (error) {
                        console.error("Failed to save state to IndexedDB (appState)", error);
                    }
                },

                renderAll() {
                    StudentModule.renderTable();
                    SubjectModule.renderTable();
                    HomeworkModule.renderStudentSelectors();
                    HomeworkModule.renderHomeworkCards();
                    ProgressModule.render();
                    LargeScreenModule.render();

                    // === NEW: 渲染合约模块 ===
                    if (typeof ContractModule !== 'undefined') {
                        ContractModule.renderStudentSelectors();
                        ContractModule.renderTable();
                    }
                    // === END NEW ===
                },

                compareHomeworks(oldHws, newHws) {
                    if (oldHws.length !== newHws.length) return 'structural';
                    const oldMap = oldHws.reduce((acc, h) => { acc[h.id] = h; return acc; }, {});
                    let statusOnlyChange = false;
                    for (const newHw of newHws) {
                        const oldHw = oldMap[newHw.id];
                        if (!oldHw) return 'structural'; 
                        if (oldHw.task !== newHw.task || oldHw.studentId !== newHw.studentId || oldHw.subjectId !== newHw.subjectId || oldHw.date !== newHw.date|| oldHw.is_deleted !== newHw.is_deleted) {
                            return 'structural'; 
                        }
                        if (oldHw.status !== newHw.status) {
                            statusOnlyChange = true;
                        }
                    }
                    return statusOnlyChange ? 'status-only' : 'none';
                },
                registerEventListeners() {
                    document.getElementById('studentManagementModal').addEventListener('show.bs.modal', () => StudentModule.renderTable());
                    document.getElementById('subjectManagementModal').addEventListener('show.bs.modal', () => SubjectModule.renderTable());
                    document.getElementById('progressModal').addEventListener('show.bs.modal', () => ProgressModule.render());
                    document.getElementById('largeScreenModal').addEventListener('show.bs.modal', () => LargeScreenModule.render());
                    // The reset button listener is moved to the SystemModule itself for better encapsulation.

                    // Listen for changes from other tabs
                    channel.onmessage = async (event) => {
                        if (event.data && event.data.type === 'STATE_UPDATED') {
                            console.log("检测到 BroadcastChannel 消息，执行同步...");
                             
                            const oldHomeworks = [...this.state.homeworks]; 
                            await this.loadState(); 
                            await ContractModule.loadState(); // 新增
                            
                            const isFullscreen = document.fullscreenElement;
                            const syncType = this.compareHomeworks(oldHomeworks, this.state.homeworks); 

                            if (isFullscreen) {
                                if (syncType === 'status-only') {
                                    console.log("仅状态变更，执行非破坏性更新，保持动画。");
                                    LargeScreenModule.updateLiveContent(this.state.homeworks); 
                                } else if (syncType === 'structural') {
                                    console.log("结构性变更，强制重建DOM，重置动画。");
                                    LargeScreenModule.stopAutoScroll(); 
                                    this.renderAll(); 
                                    if (document.fullscreenElement) {
                                        LargeScreenModule.startAutoScroll();
                                    }
                                }
                            } else {
                                requestAnimationFrame(() => this.renderAll());
                            }
                            
                            if (syncType !== 'none') {
                                UIModule.showToast('数据已自动同步', 'info'); 
                            }
                        } else if (event.data && event.data.type === 'SYSTEM_RESET') {
                             console.log("数据被清空，重置应用状态。");
                            this.state = { students: [], subjects: [], homeworks: [] };
                            await ContractModule.loadState(); // 新增
                            this.renderAll();
                            UIModule.showToast('系统已在另一窗口重置', 'info');
                        }
                    };
                },
                generateId() { return Date.now() + Math.random().toString(36).substr(2, 9); },
            };

            // =================================================================================
            // UI MODULE
            // =================================================================================
            const UIModule = {
                toastContainer: document.getElementById('toastContainer'),
                
                // 缓存模态框实例
                confirmationModal: new bootstrap.Modal(document.getElementById('confirmationModal')),
                passwordPromptModal: new bootstrap.Modal(document.getElementById('passwordPromptModal')),
                editModal: new bootstrap.Modal(document.getElementById('editModal')),
                // === (新增) 缓存 Warning Modal 实例 ===
                warningModal: null, // 延迟初始化，因为它可能是动态创建的
                
                // 缓存模态框内部元素
                confirmationModalTitle: document.getElementById('confirmationModalTitle'),
                confirmationModalBody: document.getElementById('confirmationModalBody'),
                confirmActionBtn: document.getElementById('confirmActionBtn'),
                
                passwordPromptTitle: document.getElementById('passwordPromptTitle'),
                passwordPromptMessage: document.getElementById('passwordPromptMessage'),
                passwordPromptInput: document.getElementById('passwordPromptInput'),
                passwordPromptConfirmBtn: document.getElementById('passwordPromptConfirmBtn'),

                editModalTitle: document.getElementById('editModalTitle'),
                editModalBody: document.getElementById('editModalBody'),
                editModalSaveBtn: document.getElementById('saveEditBtn'),
                editModalCancelBtn: document.querySelector('#editModal .btn-secondary'),

                // === (新增) 缓存 Warning Modal 按钮 ===
                warningConfirmBtn: null, // 延迟初始化

                // 新增：显示全屏锁定
                showScreenLock(message = '请稍候...') {
                const overlay = document.getElementById('screenLockOverlay');
                const msgEl = document.getElementById('screenLockMessage');
                    if (overlay && msgEl) {
                    msgEl.textContent = message;
                    overlay.classList.remove('d-none');
                    document.body.classList.add('screen-locked'); // 禁止背景滚动
                    }
                },

                // 这是新的 showToast 函数
showToast(message, type = 'success') {
    // 1. 检查容器是否存在
    if (!this.toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    // 2. 创建 toast 元素
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    // 样式来自 style.css，我们不需要在这里写 style
    toast.className = `custom-toast ${type}`; 
    toast.textContent = message;

    // 3. (关键修改) 添加到固定的容器中，而不是 body
    this.toastContainer.appendChild(toast);

    // 4. 渐入动画 (CSS transition会处理)
    setTimeout(() => {
        toast.classList.add('show');
    }, 10); // 10毫秒延迟确保CSS过渡生效

    // 5. 自动消失（渐出动画）
    setTimeout(() => {
        toast.classList.remove('show');
        // 6. 动画结束后，从DOM中移除
        setTimeout(() => {
            if (toast) toast.remove();
        }, 300); // 300ms 对应 style.css 里的 transition 时间
    }, 3000); // 提示框显示3秒
},


                

                showConfirmation(title, message, callback) {
                this.confirmationModalTitle.textContent = title;
                // === 修改点：将 textContent 改为 innerHTML 以支持样式标签 ===
                this.confirmationModalBody.innerHTML = message; 
                // === 修改结束 ===

                // 1. 克隆按钮
                const newConfirmBtn = this.confirmActionBtn.cloneNode(true);
                this.confirmActionBtn.parentNode.replaceChild(newConfirmBtn, this.confirmActionBtn);
                this.confirmActionBtn = newConfirmBtn; // 更新缓存的引用

                // 2. 定义处理函数
                const confirmButtonHandler = () => {
                    callback(); 
                    this.confirmationModal.hide(); 
                };

                // 3. 绑定持久侦听器
                this.confirmActionBtn.addEventListener('click', confirmButtonHandler);

                // 4. 绑定清理侦听器
                const modalElement = document.getElementById('confirmationModal');
                modalElement.addEventListener('hidden.bs.modal', () => {
                    this.confirmActionBtn.removeEventListener('click', confirmButtonHandler);
                }, { once: true });

                this.confirmationModal.show();
            },


                showPasswordPrompt(title, message, password, callback) {
                this.passwordPromptTitle.textContent = title;
                this.passwordPromptMessage.textContent = message;

                // (修复 2 & 3: 确保在函数调用时*立即*清空上次的值)
                this.passwordPromptInput.value = ''; 

                // 1. 克隆按钮以清除所有旧监听器
                const newConfirmBtn = this.passwordPromptConfirmBtn.cloneNode(true);
                this.passwordPromptConfirmBtn.parentNode.replaceChild(newConfirmBtn, this.passwordPromptConfirmBtn);
                this.passwordPromptConfirmBtn = newConfirmBtn; // 更新缓存的引用

                // 2. (关键修复) 定义一个可复用的处理函数
                const passwordButtonHandler = () => {
                    if (this.passwordPromptInput.value === password) {
                        // 密码正确
                        callback();
                        this.passwordPromptModal.hide();
                    }
                    else {
                        // (修复 1 & 2: 密码错误时的处理)
                        this.showToast("密码错误！", "error");
                        this.passwordPromptInput.value = ''; // 重置为空
                        this.passwordPromptInput.focus();  // 光标置入
                    }
                };

                // 3. 绑定持久的点击侦听器
                this.passwordPromptConfirmBtn.addEventListener('click', passwordButtonHandler);

                // (获取模态框的 DOM 元素)
                const modalElement = document.getElementById('passwordPromptModal');

                // 4. (修复 3: 绑定 *清理* 侦听器)
                modalElement.addEventListener('hidden.bs.modal', () => {
                    // 当模态框 *完全隐藏后*
                    // 1. 移除按钮侦听器
                    this.passwordPromptConfirmBtn.removeEventListener('click', passwordButtonHandler);
                    // 2. (再次清空) 确保输入框在关闭时是干净的，防止下次打开残留
                    this.passwordPromptInput.value = ''; 
                }, { once: true }); // 这个清理侦听器只运行一次

                // 5. (修复 1: 绑定 *弹出后自动聚焦* 侦听器)
                modalElement.addEventListener('shown.bs.modal', () => {
                    // 当模态框 *完全显示后*
                    this.passwordPromptInput.focus(); // 将光标置入
                }, { once: true }); // 这个聚焦侦听器也只运行一次

                // 6. 显示模态框
                this.passwordPromptModal.show();
            },

                // *** (优化) ***
                // *** (修复) ***
// (这是修复后的 showEditModal 函数，请完整替换)
// 修复了 'once: true' 导致验证失败时，按钮侦听器丢失的问题
showEditModal(title, formHTML, callback, confirmText = '保存更改', cancelText = '取消') {
    // 1. 设置标题、内容和按钮文案
    this.editModalTitle.textContent = title;
    this.editModalBody.innerHTML = formHTML;

    if (this.editModalSaveBtn) this.editModalSaveBtn.textContent = confirmText;
    if (this.editModalCancelBtn) this.editModalCancelBtn.textContent = cancelText;

    // 2. 克隆按钮以清除所有旧监听器
    const newSaveBtn = this.editModalSaveBtn.cloneNode(true);

    // 3. 替换 DOM 中的旧按钮
    this.editModalSaveBtn.parentNode.replaceChild(newSaveBtn, this.editModalSaveBtn);

    // 4. 更新缓存的按钮引用
    this.editModalSaveBtn = newSaveBtn;

    // 5. (关键修复) 定义一个可复用的处理函数
    const saveButtonHandler = () => {
        // 运行你传入的回调 (例如“保存合约”的逻辑)
        // 如果回调返回 true (验证通过并保存成功)
        if (callback()) {
            // 我们才隐藏模态框
            this.editModal.hide();
        }
        // 如果回调返回 false (例如日期重叠验证失败)
        // 我们什么也不做，模态框会保持打开，
        // 并且这个 'saveButtonHandler' 侦听器会 *保持激活*，
        // 等待用户的下一次点击。
    };

    // 6. (关键修复) 绑定 *持久* 的点击侦听器（移除了 { once: true }）
    this.editModalSaveBtn.addEventListener('click', saveButtonHandler);

    // 7. (关键修复) 添加一个 *一次性* 的侦听器，用于 *清理*
    // 无论模态框是通过 'X'、'取消' 还是 '保存成功' 关闭的，
    // 'hidden.bs.modal' (完全隐藏后) 事件都会触发。
    const modalElement = document.getElementById('editModal'); // 获取模态框的 DOM 元素

    modalElement.addEventListener('hidden.bs.modal', () => {
        // 当模态框关闭时，我们手动移除 'saveButtonHandler'，
        // 这样下次打开模态框时，状态是干净的。
        this.editModalSaveBtn.removeEventListener('click', saveButtonHandler);
    }, { once: true }); // 这个清理侦听器本身必须是 'once: true'

    // 8. 显示模态框
    this.editModal.show();
},


                // === 新增：警示模态函数 ===
    // === 修复后的警示模态函数 ===
showWarningModal(title, message, onConfirm) {
  let modalEl = document.getElementById('warningModal');
  if (!modalEl) {
    // 首次创建模态框
    const modalHTML = `
      <div class="modal fade" id="warningModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-warning">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
              <button type="button" class="btn btn-warning" id="warningConfirmBtn">确认</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modalEl = document.getElementById('warningModal');

    // === (新增) 仅在首次创建时缓存实例和按钮 ===
            this.warningModal = new bootstrap.Modal(modalEl);
            this.warningConfirmBtn = document.getElementById('warningConfirmBtn');
}

  // 每次调用都覆盖标题和正文内容
  modalEl.querySelector('.modal-title').textContent = title || '提示';
  modalEl.querySelector('.modal-body').textContent = message || '';

  // === (修复) 使用与其它模态框一致的克隆和绑定模式 ===
  
  // 1. 克隆缓存的按钮以清除所有旧监听器
  const newConfirmBtn = this.warningConfirmBtn.cloneNode(true);
  
  // 2. 替换 DOM 中的旧按钮
  this.warningConfirmBtn.parentNode.replaceChild(newConfirmBtn, this.warningConfirmBtn);
  
  // 3. 更新缓存的按钮引用
  this.warningConfirmBtn = newConfirmBtn; 

  /// 4. 定义处理函数
  const warningButtonHandler = () => {
      if (onConfirm) onConfirm();
      this.warningModal.hide();
  };

  // 5. 绑定持久侦听器
  this.warningConfirmBtn.addEventListener('click', warningButtonHandler);

  // 6. 绑定清理侦听器
  // (注意：modalEl 变量在上面已经定义过了)
  modalEl.addEventListener('hidden.bs.modal', () => {
      this.warningConfirmBtn.removeEventListener('click', warningButtonHandler);
  }, { once: true });
  // === 修复结束 ===

  // 7. 显示缓存的模态框
  this.warningModal.show();
}
            };

            // =================================================================================
            // STUDENT MODULE
            // =================================================================================
            const StudentModule = {
                form: document.getElementById('addStudentForm'),
                tableBody: document.getElementById('studentTableBody'),
                filterNameInput: document.getElementById('filterStudentByName'),
                filterGradeSelect: document.getElementById('filterStudentByGrade'),
                gradeTagsContainer: document.getElementById('studentGradeTags'),
                importBtn: document.getElementById('importStudentBtn'),
                importFileInput: document.getElementById('importStudentFile'),
                exportBtn: document.getElementById('exportStudentBtn'),
                clearAllBtn: document.getElementById('clearAllStudentsBtn'),

                init() {
                    this.form.addEventListener('submit', this.handleAdd.bind(this));
                    this.filterNameInput.addEventListener('input', () => this.renderTable());
                    this.filterGradeSelect.addEventListener('change', () => this.renderTable());
                    this.filterGradeSelect.innerHTML = '<option value="">按年级筛选</option>' + App.grades.map(g => `<option value="${g}">${g}</option>`).join('');
                    this.tableBody.addEventListener('click', e => {
                        if (e.target.classList.contains('fa-edit')) { this.handleEdit(e.target.dataset.id); }
                        if (e.target.classList.contains('fa-trash-alt')) { this.handleDelete(e.target.dataset.id); }
                    });

                    this.renderGradeTags();
                    this.gradeTagsContainer.addEventListener('click', this.handleGradeTagSelection.bind(this));
                    
                    this.importBtn.addEventListener('click', () => this.importFileInput.click());
                    this.importFileInput.addEventListener('change', this.handleImport.bind(this));
                    this.exportBtn.addEventListener('click', this.handleExport.bind(this));
                    this.clearAllBtn.addEventListener('click', this.handleClearAll.bind(this));
                },
                renderGradeTags() {
                    this.gradeTagsContainer.innerHTML = App.grades.map(g => `<div class="grade-tag" data-grade="${g}">${g}</div>`).join('');
                },
                handleGradeTagSelection(e) {
                    const selectedTag = e.target.closest('.grade-tag');
                    if (!selectedTag) return;
                    this.gradeTagsContainer.querySelectorAll('.grade-tag').forEach(tag => tag.classList.remove('selected'));
                    selectedTag.classList.add('selected');
                },
                handleAdd(e) {
                    e.preventDefault();
                    const name = document.getElementById('studentName').value.trim();
                    const selectedGradeTag = this.gradeTagsContainer.querySelector('.grade-tag.selected');
                    if (!selectedGradeTag) {
                        UIModule.showToast('请选择一个年级！', 'error', 'center');
                        return;
                    }
                    const grade = selectedGradeTag.dataset.grade;
                    const remarks = document.getElementById('studentRemarks').value.trim();

                    if (App.state.students.filter(s => !s.is_deleted).some(s => s.name === name && s.grade === grade)) { UIModule.showToast('该年级已存在同名学生！', 'error', 'center'); return; }
                    App.state.students.push({ id: App.generateId(), name, grade, remarks, is_deleted: false });
                    App.saveState();
                    UIModule.showToast('学生添加成功！');
                    this.form.reset();
                    this.gradeTagsContainer.querySelectorAll('.grade-tag').forEach(tag => tag.classList.remove('selected'));
                    App.renderAll();
                },
                handleEdit(id) {
                    const student = App.state.students.find(s => s.id === id && !s.is_deleted);
                    if (!student) return;
                    const gradeTagsHTML = App.grades.map(g => `<div class="grade-tag ${student.grade === g ? 'selected' : ''}" data-grade="${g}">${g}</div>`).join('');
                    const formHTML = `
                        <div class="mb-3"><label for="editStudentName" class="form-label">姓名*</label><input type="text" id="editStudentName" class="form-control" value="${student.name}" required></div>
                        <div class="mb-3"><label class="form-label">年级*</label><div id="editStudentGradeTags" class="grade-tags">${gradeTagsHTML}</div></div>
                        <div class="mb-3"><label for="editStudentRemarks" class="form-label">备注</label><textarea id="editStudentRemarks" class="form-control" rows="3">${student.remarks}</textarea></div>`;
                    
                    UIModule.showEditModal('编辑学生信息', formHTML, () => {
                        const newName = document.getElementById('editStudentName').value.trim();
                        const selectedTag = document.getElementById('editStudentGradeTags').querySelector('.grade-tag.selected');
                        if (!selectedTag) { UIModule.showToast('请选择年级！', 'error', 'center'); return false; }
                        const newGrade = selectedTag.dataset.grade;

                        if (App.state.students.filter(s => !s.is_deleted).some(s => s.id !== id && s.name === newName && s.grade === newGrade)) { UIModule.showToast('该年级已存在同名学生！', 'error', 'center'); return false; }
                        student.name = newName;
                        student.grade = newGrade;
                        student.remarks = document.getElementById('editStudentRemarks').value.trim();
                        App.saveState();
                        UIModule.showToast('学生信息更新成功！');
                        App.renderAll();
                        return true;
                    });

                    document.getElementById('editStudentGradeTags').addEventListener('click', e => {
                        const selectedTag = e.target.closest('.grade-tag');
                        if (!selectedTag) return;
                        document.getElementById('editStudentGradeTags').querySelectorAll('.grade-tag').forEach(tag => tag.classList.remove('selected'));
                        selectedTag.classList.add('selected');
                    });
                },
                
                handleDelete(id) {
        const student = App.state.students.find(s => s.id === id && !s.is_deleted);
        UIModule.showConfirmation('删除学生', `确定要删除学生【${student.name} - ${student.grade}】吗？删除学生会一并删除该学生的所有作业和合约。`, () => {
            
            // === 改造：从 filter 改为 软删除 ===
            const studentToDel = App.state.students.find(s => s.id === id);
            if (studentToDel) studentToDel.is_deleted = true;

            // 1. 删除作业模块数据 (使用 App.state)
            // App.state.students = App.state.students.filter(s => s.id !== id); // 旧代码
            // App.state.homeworks = App.state.homeworks.filter(h => h.studentId !== id); // 旧代码
            App.state.homeworks.forEach(h => {
                if (h.studentId === id) h.is_deleted = true;
            });
            App.saveState(); // 保存 appState
            
            // 2. 删除合约模块数据 (使用 ContractModule.state)
            // ContractModule.state.contracts = ContractModule.state.contracts.filter(c => c.studentId !== id); // 旧代码
            ContractModule.state.contracts.forEach(c => {
                if (c.studentId === id) c.is_deleted = true;
            });
            ContractModule.saveState(); // 保存 contractState
            // === 改造结束 ===

            UIModule.showToast('学生删除成功！');
            App.renderAll();
                    });
                },

                // 这是新的 handleImport 函数 增加导入时的重复数据检测功能。
handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            let addedCount = 0;
            let skippedCount = 0;

            // --- 改造开始 ---
            // 1. 创建一个临时的Set，用于跟踪 *本次导入* 已经添加的学生
            const importedKeys = new Set(); 
            // --- 改造结束 ---

            json.forEach(row => {
                // 确保 trim() 在所有可能的值上调用
                const name = (row['学生姓名'] || row['姓名'] || '').toString().trim();
                const grade = (row['年级'] || '').toString().trim();
                const remarks = (row['备注'] || '').toString().trim();

                // 检查数据是否有效
                if (name && grade && App.grades.includes(grade)) {

                    // --- 改造开始 ---
                    // 2. 创建一个唯一键，例如 "张三|一年级"
                    const uniqueKey = `${name}|${grade}`;

                    // 3. 检查数据库 (App.state) 中是否已存在
                    const existsInState = App.state.students.filter(s => !s.is_deleted).some(s => s.name === name && s.grade === grade);
                    // 4. 检查 *本次Excel* 中是否已导入过 (防止Excel内部重复)
                    const existsInCurrentImport = importedKeys.has(uniqueKey);
                    // --- 改造结束 ---

                    // 5. 必须两个都不存在时，才允许添加
                    if (!existsInState && !existsInCurrentImport) {
                        App.state.students.push({ id: App.generateId(), name, grade, remarks, is_deleted: false });
                        importedKeys.add(uniqueKey); // 6. 将新添加的学生加入Set
                        addedCount++;
                    } else {
                        skippedCount++;
                    }
                }
            });

            if (addedCount > 0) {
                App.saveState();
                App.renderAll();
            }
            // (修改了提示文本)
            UIModule.showToast(`导入完成！成功添加 ${addedCount} 名学生，跳过 ${skippedCount} 名重复/已存在学生。`, 'success');
        } catch (err) {
            UIModule.showToast('文件解析失败，请检查文件格式是否正确！', 'error');
            console.error(err);
        } finally {
            this.importFileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
},

                handleExport() {
                    if (App.state.students.length === 0) {
                        UIModule.showToast('没有学生信息可导出。', 'info');
                        return;
                    }
                    const dataToExport = App.state.students.filter(s => !s.is_deleted).map(s => ({
                        '学生姓名': s.name,
                        '年级': s.grade,
                        '备注': s.remarks
                    }));
                    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "学生列表");
                    XLSX.writeFile(workbook, "学生信息列表.xlsx");
                    UIModule.showToast("导出成功！");
                },
                

                handleClearAll() {
                    // === 安全升级：使用 showPasswordPrompt 替代 showConfirmation ===
                    // 强制要求输入密码才能执行敏感操作
                    UIModule.showPasswordPrompt(
                        '清空所有学生', 
                        '警告：此操作将删除所有学生信息及其全部作业和合约记录，且无法恢复！\n\n为了确认您的操作，请输入管理员密码：', 
                        'peiyoutuoguan', // 这里设定验证密码，与系统重置密码保持一致
                        () => {
                            // === 验证通过后的执行逻辑 (保持原有的软删除逻辑) ===
                            
                            // 1. 软删除所有学生
                            App.state.students.forEach(s => { s.is_deleted = true; });
                            
                            // 2. 软删除所有作业 (因为作业依赖学生)
                            App.state.homeworks.forEach(h => { h.is_deleted = true; });
                            
                            // 3. 保存作业模块状态
                            App.saveState(); 
                            
                            // 4. 软删除所有合约 (因为合约依赖学生)
                            // 增加判空检查，防止 ContractModule 未加载时报错
                            if (typeof ContractModule !== 'undefined' && ContractModule.state && ContractModule.state.contracts) {
                                ContractModule.state.contracts.forEach(c => { c.is_deleted = true; });
                                ContractModule.saveState(); // 保存合约模块状态
                            }

                            // 5. 提示与刷新
                            UIModule.showToast('已清空所有学生信息。', 'success');
                            App.renderAll();
                        }
                    );
                },

                renderTable() {
                    // === 改造：在读取时过滤已删除 ===
                    const sortedStudents = App.state.students.filter(s => !s.is_deleted).sort((a, b) => App.grades.indexOf(a.grade) - App.grades.indexOf(b.grade));
                    const nameFilter = this.filterNameInput.value.toLowerCase();
                    const gradeFilter = this.filterGradeSelect.value;
                    
                    let filteredStudents = sortedStudents;
                    if (nameFilter) { filteredStudents = filteredStudents.filter(s => s.name.toLowerCase().includes(nameFilter)); }
                    if (gradeFilter) { filteredStudents = filteredStudents.filter(s => s.grade === gradeFilter); }

                    if (filteredStudents.length === 0) { this.tableBody.innerHTML = '<tr><td colspan="5" class="text-center">暂无学生信息</td></tr>'; return; }
                    this.tableBody.innerHTML = filteredStudents.map((student, index) => `
                        <tr><td>${index + 1}</td><td>${student.name}</td><td>${student.grade}</td><td>${student.remarks}</td>
                        <td><div class="action-icons"><i class="fas fa-edit" data-id="${student.id}" title="编辑"></i><i class="fas fa-trash-alt" data-id="${student.id}" title="删除"></i></div></td></tr>
                    `).join('');
                }
            };

            // =================================================================================
            // SUBJECT MODULE
            // =================================================================================
            const SubjectModule = {
                form: document.getElementById('addSubjectForm'),
                tableBody: document.getElementById('subjectTableBody'),
                gradesContainer: document.getElementById('subjectGrades'),
                selectAllCheckbox: document.getElementById('selectAllGrades'),
                init() {
                    this.renderGradeCheckboxes('add', this.gradesContainer);
                    this.form.addEventListener('submit', this.handleAdd.bind(this));
                    this.selectAllCheckbox.addEventListener('change', this.handleSelectAll.bind(this));
                    this.gradesContainer.addEventListener('change', this.syncSelectAllCheckbox.bind(this));
                    this.tableBody.addEventListener('click', e => {
                        if (e.target.classList.contains('fa-edit')) { this.handleEdit(e.target.dataset.id); }
                        if (e.target.classList.contains('fa-trash-alt')) { this.handleDelete(e.target.dataset.id); }
                    });
                },
                renderGradeCheckboxes(prefix, container, selectedGrades = []) {
                    container.innerHTML = App.grades.map(grade => `
                        <div class="checkbox-tag">
                            <input type="checkbox" id="${prefix}-grade-${grade}" name="subjectGrade" value="${grade}" ${selectedGrades.includes(grade) ? 'checked' : ''}>
                            <label for="${prefix}-grade-${grade}">${grade}</label>
                        </div>
                    `).join('');
                },
                handleSelectAll(e) {
                    this.gradesContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => checkbox.checked = e.target.checked);
                },
                syncSelectAllCheckbox() {
                    const checkboxes = this.gradesContainer.querySelectorAll('input[type="checkbox"]');
                    const total = checkboxes.length;
                    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
                    this.selectAllCheckbox.checked = total > 0 && total === checkedCount;
                },
                handleAdd(e) {
                    e.preventDefault();
                    const name = document.getElementById('subjectName').value.trim();
                    if (App.state.subjects.filter(s => !s.is_deleted).some(s => s.name === name)) { UIModule.showToast('已存在同名科目！', 'error', 'center'); return; }
                    const selectedGrades = Array.from(this.gradesContainer.querySelectorAll('input:checked')).map(cb => cb.value);
                    if (selectedGrades.length === 0) { UIModule.showToast('请至少选择一个所属年级！', 'error', 'center'); return; }
                    App.state.subjects.push({ id: App.generateId(), name, grades: selectedGrades, is_deleted: false });
                    App.saveState();
                    UIModule.showToast('科目添加成功！');
                    this.form.reset();
                    this.gradesContainer.querySelectorAll('input:checked').forEach(cb => cb.checked = false);
                    this.selectAllCheckbox.checked = false;
                    App.renderAll();
                },
                
                handleEdit(id) {
                    // === 改造：在读取时过滤已删除 ===
                    const subject = App.state.subjects.filter(s => !s.is_deleted).find(s => s.id === id);
                    if (!subject) return;
                    const formHTML = `
                        <div class="mb-3"><label for="editSubjectName" class="form-label">科目名称*</label><input type="text" id="editSubjectName" class="form-control" value="${subject.name}" required></div>
                        <div class="mb-3"><label class="form-label">所属年级*</label><div id="editSubjectGrades" class="checkbox-tags"></div></div>`;
                    UIModule.showEditModal('编辑科目信息', formHTML, () => {
                        const newName = document.getElementById('editSubjectName').value.trim();
                        // === 改造：在查找时过滤已删除 ===
                        if (App.state.subjects.filter(s => !s.is_deleted).some(s => s.id !== id && s.name === newName)) { UIModule.showToast('已存在同名科目！', 'error', 'center'); return false; }
                        const newGrades = Array.from(document.getElementById('editSubjectGrades').querySelectorAll('input:checked')).map(cb => cb.value);
                        if (newGrades.length === 0) { UIModule.showToast('请至少选择一个所属年级！', 'error', 'center'); return false; }
                        subject.name = newName;
                        subject.grades = newGrades;
                        App.saveState();
                        UIModule.showToast('科目信息更新成功！');
                        App.renderAll();
                        return true;
                    });
                    this.renderGradeCheckboxes('edit', document.getElementById('editSubjectGrades'), subject.grades);
                },
                

                handleDelete(id) {
                    const subject = App.state.subjects.find(s => s.id === id && !s.is_deleted);
                     UIModule.showConfirmation('删除科目', `确定要删除科目【${subject.name}】吗？这会删除所有学生该科目的作业！`, () => {
                        
                        // === 改造：从 filter 改为 软删除 ===
                        // App.state.subjects = App.state.subjects.filter(s => s.id !== id); // 旧代码
                        const subjectToDel = App.state.subjects.find(s => s.id === id);
                        if (subjectToDel) subjectToDel.is_deleted = true;
                        
                        // App.state.homeworks = App.state.homeworks.filter(h => h.subjectId !== id); // 旧代码
                        App.state.homeworks.forEach(h => {
                            if (h.subjectId === id) h.is_deleted = true;
                        });
                        // === 改造结束 ===

                        App.saveState();
                        UIModule.showToast('科目删除成功！');
                        App.renderAll();
                    });
                },

                renderTable() {
                    // === 改造：在读取时过滤已删除 ===
                    const activeSubjects = App.state.subjects.filter(s => !s.is_deleted);

                    // --- (新) 核心修改：应用标准科目排序 ---
                    // 复制 HomeworkModule 和 LargeScreenModule中的科目排序逻辑
                    const SUBJECT_ORDER = [
                        '语文','数学','英语','物理','化学',
                        '道法','历史','生物','地理','科学','其他'
                    ];

                    activeSubjects.sort((a, b) => {
                        const idxA = SUBJECT_ORDER.indexOf(a.name);
                        const idxB = SUBJECT_ORDER.indexOf(b.name);
                        
                        // 如果科目不在 SUBJECT_ORDER 列表中 (idx === -1)，
                        // 则将其视为一个大索引 (SUBJECT_ORDER.length)，使其排在列表末尾。
                        return (idxA === -1 ? SUBJECT_ORDER.length : idxA) -
                               (idxB === -1 ? SUBJECT_ORDER.length : idxB);
                    });
                    // --- (新) 排序结束 ---


                    if (activeSubjects.length === 0) { 
                        this.tableBody.innerHTML = '<tr><td colspan="4" class="text-center">暂无科目信息</td></tr>'; 
                        return; 
                    }
                    
                    // 使用已排序的 activeSubjects 列表生成 HTML
                    this.tableBody.innerHTML = activeSubjects.map((subject, index) => `
                        <tr><td>${index + 1}</td><td>${subject.name}</td><td>${subject.grades.join(', ')}</td>
                        <td><div class="action-icons"><i class="fas fa-edit" data-id="${subject.id}" title="编辑"></i><i class="fas fa-trash-alt" data-id="${subject.id}" title="删除"></i></div></td></tr>
                    `).join('');
                }
            };

            // =================================================================================
            // HOMEWORK MODULE (*** MODIFIED FOR MULTI-SUBJECT REGISTRATION ***)
            // =================================================================================
            const HomeworkModule = {
    // Elements (support both new range inputs and legacy single-date)
    selectStudentInput: document.getElementById('selectStudent'),
    studentDatalist: document.getElementById('studentDatalistOptions'),
    studentWarning: document.getElementById('studentSelectionWarning'),

    subjectSection: document.getElementById('subjectSelectionSection'),
    subjectIconsContainer: document.getElementById('subjectIconsContainer'),
    taskSection: document.getElementById('taskInputSection'),
    multiSubjectTaskContainer: document.getElementById('multiSubjectTaskContainer'),

    classmatesContainer: document.getElementById('classmatesSelectionContainer'),
    classmateTags: document.getElementById('classmateTags'),

    registerBtn: document.getElementById('registerHomeworkBtn'),
    homeworkListContainer: document.getElementById('todaysHomeworkList'),

    // prefer range controls; fall back to legacy single date control if present
    filterStartDate: document.getElementById('filterHomeworkStartDate') || document.getElementById('filterHomeworkDate'),
    filterEndDate: document.getElementById('filterHomeworkEndDate') || document.getElementById('filterHomeworkDate'),

    // --- (已修改) ---
    // 引用新的“按钮”
    filterStudentNameBtn: document.getElementById('filterStudentNameBtn'),
    filterCompletionStatusBtn: document.getElementById('filterCompletionStatusBtn'),
    // 引用新的“菜单容器”
    filterStudentNameContainer: document.getElementById('filterStudentNameContainer'),
    filterCompletionStatusContainer: document.getElementById('filterCompletionStatusContainer'),
    // --- (修改结束) ---

    exportBtn: document.getElementById('exportHomeworkBtn'),
    deleteAllBtn: document.getElementById('deleteAllHomeworkBtn'),

    selectedStudentId: null,

                // *** (优化) ***
                // 缓存 Bulk Input Modal 的元素
                _bulkModal: null,
                _ocrModal: null, // <--- 添加这一行
                _bulkContext: null,
                _bulkSubjectNameInput: null,
                _bulkTextarea: null,
                _bulkPreview: null,
                _bulkConfirmBtn: null,

                // *** (优化) ***
                // 缓存 OCR Input Modal 的元素
                _ocrModal: null,
                _ocrCtx: null,
                _ocrRunning: false,
                // --- (新) 添加这三行 ---
                _ocrScriptLoaded: false,  // 标记脚本是否已加载
                _ocrScriptLoading: false, // 标记脚本是否正在加载（防止重复点击）
                _tesseractWorker: null,   // (优化) 缓存Tesseract工作实例
                // --- (新) 添加结束 ---
                _ocrSubjectNameInput: null,
                _ocrDropzone: null,
                _ocrImagePreview: null,
                _ocrResultTextarea: null,
                _ocrResultPreview: null,
                _ocrProgressFlag: null,
                _ocrProgressText: null,
                _ocrConfirmBtn: null,

                // (新) 辅助函数：更新下拉按钮的显示文本
    _updateDropdownButtonText(container, button, defaultText) {
        if (!container || !button) return;

        const checkedLabels = Array.from(
            container.querySelectorAll('input[type="checkbox"]:checked')
        ).map(cb => {
            // 寻找复选框旁边的 <label> 文本
            const label = cb.nextElementSibling;
            return label ? label.textContent.trim() : cb.value;
        });

        if (checkedLabels.length === 0) {
            button.textContent = defaultText;
        } else if (checkedLabels.length <= 2) {
            // 如果选了1-2个，直接显示名字
            button.textContent = checkedLabels.join(', ');
        } else {
            // 选了3个或更多，显示 "已选择 X 项"
            button.textContent = `已选择 ${checkedLabels.length} 项`;
        }
    },

    init() {
  // basic listeners
                    // *** (优化) ***
                    // 缓存 Bulk Input Modal 元素
                    this._bulkSubjectNameInput = document.getElementById('bulkInputSubjectName'); //
                    this._bulkTextarea = document.getElementById('bulkInputTextarea'); //
                    this._bulkPreview = document.getElementById('bulkInputPreview'); //
                    this._bulkConfirmBtn = document.getElementById('bulkInputConfirmBtn'); //

                    // *** (优化) ***
                    // 缓存 OCR Input Modal 元素
                    this._ocrSubjectNameInput = document.getElementById('ocrInputSubjectName'); //
                    this._ocrDropzone = document.getElementById('ocrDropzone'); //
                    this._ocrImagePreview = document.getElementById('ocrImagePreview'); //
                    this._ocrResultTextarea = document.getElementById('ocrResultTextarea'); //
                    this._ocrResultPreview = document.getElementById('ocrResultPreview'); //
                    this._ocrProgressFlag = document.getElementById('ocrProgressFlag'); //
                    this._ocrProgressText = document.getElementById('ocrProgressText'); //
                    this._ocrConfirmBtn = document.getElementById('ocrInputConfirmBtn'); //


  if (this.selectStudentInput) {
    this.selectStudentInput.addEventListener('change', this.handleStudentSelection.bind(this)); //
    this.selectStudentInput.addEventListener('input', this.handleStudentInput.bind(this)); //
  }
  if (this.subjectIconsContainer) {
    this.subjectIconsContainer.addEventListener('click', this.handleSubjectSelection.bind(this)); //
  }

  // 合并：taskSection 统一事件委托（添加/删除输入、整段输入、图片识别）
  if (this.taskSection) {
    this.taskSection.addEventListener('click', (e) => {
      const addBtn  = e.target.closest && e.target.closest('.add-task-for-subject-btn');
      const delBtn  = e.target.closest && e.target.closest('.delete-homework-task-btn');
      const bulkBtn = e.target.closest && e.target.closest('.bulk-input-for-subject-btn');
      const ocrBtn  = e.target.closest && e.target.closest('.ocr-input-for-subject-btn');

      // 添加一项
      if (addBtn) {
        const box = addBtn.closest('.subject-task-group');
        const tasksContainer = box && box.querySelector('.tasks-for-subject');
        if (!tasksContainer) return;
        const group = document.createElement('div');
        group.className = 'input-group mb-2';
        group.innerHTML = `
          <input type="text" class="form-control homework-task-input" placeholder="请输入作业内容">
          <button class="btn btn-outline-danger delete-homework-task-btn" type="button"><i class="fas fa-times"></i></button>
        `;
        tasksContainer.appendChild(group);
        // === 核心修改：自动聚焦新输入框 ===
        const newInput = group.querySelector('input');
        if (newInput) {
            newInput.focus();
        }
        // === 修改结束 ===
        return;
      }

      // 删除一项（至少保留一个输入框；否则清空）
      if (delBtn) {
        const group = delBtn.closest('.input-group');
        const container = delBtn.closest('.tasks-for-subject');
        if (!group || !container) return;
        const groups = container.querySelectorAll('.input-group');
        if (groups.length > 1) {
          group.remove();
        } else {
          const input = group.querySelector('input');
          if (input) input.value = '';
        }
        return;
      }

      // 整段输入
      if (bulkBtn) {
        const box = bulkBtn.closest('.subject-task-group');
        if (!box) return;
        const sid = box.dataset.subjectId;
        const subject = App.state.subjects.find(s => s.id === sid && !s.is_deleted);
        const subjectName = subject ? subject.name : '未知科目';
        HomeworkModule._openBulkInputModal({ subjectId: sid, subjectName, targetBox: box });
        return;
      }

      // 图片识别
      if (ocrBtn) {
        const box = ocrBtn.closest('.subject-task-group');
        if (!box) return;
        const sid = box.dataset.subjectId;
        const subject = App.state.subjects.find(s => s.id === sid && !s.is_deleted);
        const subjectName = subject ? subject.name : '未知科目';
        HomeworkModule._openOCRModal({ subjectId: sid, subjectName, targetBox: box });
        return;
      }
    });
  }

  if (this.classmateTags) {
    this.classmateTags.addEventListener('click', this.handleClassmateTagClick.bind(this)); //
  }
  if (this.registerBtn) {
    this.registerBtn.addEventListener('click', this.handleRegister.bind(this)); //
  }

  // filters
  if (this.filterStartDate) {
    this.filterStartDate.addEventListener('change', () => this.renderHomeworkCards()); //
  }
  if (this.filterEndDate) {
    this.filterEndDate.addEventListener('change', () => this.renderHomeworkCards()); //
  }
  
  // --- (保留) 监听下拉菜单 *内部* 的点击 ---
  // (这负责用户在里面 *勾选* 复选框)
  if (this.filterStudentNameContainer) {
    this.filterStudentNameContainer.addEventListener('click', (e) => {
        e.stopPropagation(); 
        this.renderHomeworkCards();
        this._updateDropdownButtonText(this.filterStudentNameContainer, this.filterStudentNameBtn, '按姓名筛选');
    });
  }
  if (this.filterCompletionStatusContainer) {
    this.filterCompletionStatusContainer.addEventListener('click', (e) => {
        e.stopPropagation(); 
        this.renderHomeworkCards();
        this._updateDropdownButtonText(this.filterCompletionStatusContainer, this.filterCompletionStatusBtn, '按完成状态筛选');
    });
  }
  // --- (保留结束) ---


  // --- (核心修改) ---
  // (新) 监听 *按钮本身* 的点击
  // (这负责在菜单 *打开前* 自动清空)
  if (this.filterStudentNameBtn) {
    this.filterStudentNameBtn.addEventListener('click', () => {
        // 1. 找到所有已选中的复选框
        const checkedInputs = this.filterStudentNameContainer.querySelectorAll('input[type="checkbox"]:checked');
        
        // 2. 如果一个都没选，就什么都不做 (直接打开菜单)
        if (checkedInputs.length === 0) return;

        // 3. 如果有选中的，就取消它们的选中
        checkedInputs.forEach(cb => {
            cb.checked = false;
        });

        // 4. (关键) 立即刷新列表
        this.renderHomeworkCards();

        // 5. (关键) 立即更新按钮文本
        this._updateDropdownButtonText(this.filterStudentNameContainer, this.filterStudentNameBtn, '按姓名筛选');
    });
  }
    
  if (this.filterCompletionStatusBtn) {
    this.filterCompletionStatusBtn.addEventListener('click', () => {
        const checkedInputs = this.filterCompletionStatusContainer.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedInputs.length === 0) return;
        checkedInputs.forEach(cb => {
            cb.checked = false;
        });
        this.renderHomeworkCards();
        this._updateDropdownButtonText(this.filterCompletionStatusContainer, this.filterCompletionStatusBtn, '按完成状态筛选');
    });
  }
  // --- (核心修改结束) ---


  // compatibility: if legacy single-date exists, sync changes both ways
  const legacy = document.getElementById('filterHomeworkDate');
  if (legacy) {
    legacy.addEventListener('change', () => {
      const v = legacy.value || '';
      if (this.filterStartDate && this.filterStartDate !== legacy) this.filterStartDate.value = v;
      if (this.filterEndDate && this.filterEndDate !== legacy) this.filterEndDate.value = v;
      this.renderHomeworkCards();
    });
    // if we only have legacy control, make sure both references point to it
    if (!document.getElementById('filterHomeworkStartDate')) this.filterStartDate = legacy;
    if (!document.getElementById('filterHomeworkEndDate')) this.filterEndDate = legacy;
  }

  if (this.exportBtn) {
    this.exportBtn.addEventListener('click', this.handleExport.bind(this)); //
  }
  if (this.deleteAllBtn) {
    this.deleteAllBtn.addEventListener('click', this.handleDeleteAll.bind(this)); //
  }
  if (this.homeworkListContainer) {
    this.homeworkListContainer.addEventListener('click', this.handleCardActions.bind(this)); //
    this.homeworkListContainer.addEventListener('change', this.handleStatusChange.bind(this)); //
  }


                    // *** (优化) ***
                    // 在 init() 中只绑定一次模态框按钮事件
                    if (this._bulkConfirmBtn) {
                        this._bulkConfirmBtn.addEventListener('click', () => this._confirmBulkInput());
                    }
                    if (this._ocrConfirmBtn) {
                        this._ocrConfirmBtn.addEventListener('click', () => this._confirmOCRInput());
                    }

    // --- 改造开始 ---
// 2. 实例化并缓存模态框
try {
    const bulkModalEl = document.getElementById('bulkInputModal');
    if (bulkModalEl) {
        this._bulkModal = new bootstrap.Modal(bulkModalEl);
    }
    const ocrModalEl = document.getElementById('ocrInputModal');
    if (ocrModalEl) {
        this._ocrModal = new bootstrap.Modal(ocrModalEl);
    }
} catch (e) {
    console.error('Failed to initialize bulk/OCR modals:', e);
}
// --- 改造结束 ---
  // init date inputs to today safely
  try {
    const today = getBeijingDateString();
    if (this.filterStartDate) this.filterStartDate.value = today;
    if (this.filterEndDate) this.filterEndDate.value = today;
    if (legacy) legacy.value = today;
  } catch (e) {
    console.error('设置过滤日期失败', e);
  }
},


    // --- (新) 添加这个辅助函数 ---
_loadTesseractScript() {
    // 返回一个 Promise，以便我们知道它何时加载完成
    return new Promise((resolve, reject) => {
        // 1. 动态创建 <script> 标签
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

        // 2. 加载成功时的回调
        script.onload = () => {
            console.log('Tesseract.js script dynamically loaded.');
            this._ocrScriptLoaded = true;   // 标记为已加载
            this._ocrScriptLoading = false; // 标记为加载中=false
            resolve(); // 告诉 Promise 成功了
        };

        // 3. 加载失败时的回调
        script.onerror = () => {
            console.error('Failed to load Tesseract.js script.');
            this._ocrScriptLoading = false; // 标记为加载中=false
            reject(); // 告诉 Promise 失败了
        };

        // 4. 把它添加到页面上，开始加载
        document.body.appendChild(script);
    });
},
// --- (新) 添加结束 ---

    renderStudentSelectors() {
        // === 改造：在读取时过滤已删除 ===
        const sortedStudents = App.state.students.filter(s => !s.is_deleted).sort((a, b) => App.grades.indexOf(a.grade) - App.grades.indexOf(b.grade));
        if (this.studentDatalist) this.studentDatalist.innerHTML = sortedStudents.map(s => `<option value="${s.name} (${s.grade})"></option>`).join('');
        
        // --- (已修改) 升级“按姓名筛选”为下拉复选框 ---
        if (this.filterStudentNameContainer) {
            this.filterStudentNameContainer.innerHTML = sortedStudents.map(s => `
                <div class="dropdown-item-text px-3">
                    <input type="checkbox" id="filter-student-${s.id}" class="form-check-input" name="filterStudentName" value="${s.id}">
                    <label for="filter-student-${s.id}" class="form-check-label ms-2">${s.name} (${s.grade})</label>
                </div>
            `).join('');
        }
        // --- (修改结束) ---

        if (this.classmateTags) this.classmateTags.innerHTML = ''; // populated on student selection
    },

    handleStudentInput() {
        if (this.studentWarning) this.studentWarning.classList.add('d-none');
    },

    handleStudentSelection(e) {
        const val = (e && e.target ? e.target.value : (this.selectStudentInput && this.selectStudentInput.value)) || '';
        // === 改造：在读取时过滤已删除 ===
        const student = App.state.students.filter(s => !s.is_deleted).find(s => `${s.name} (${s.grade})` === val.trim());
        this.resetRegistrationForm(true);

        if (!student) {
            this.selectedStudentId = null;
            if (this.studentWarning) this.studentWarning.classList.remove('d-none');
            return;
        }

        this.selectedStudentId = student.id;
        if (this.studentWarning) this.studentWarning.classList.add('d-none');

        this.renderSubjectIcons(student.grade);
        this.renderClassmateTags(student.grade, student.id);
        if (this.subjectSection) this.subjectSection.classList.remove('d-none');
        if (this.taskSection) this.taskSection.classList.remove('d-none');
        if (this.classmatesContainer) this.classmatesContainer.classList.remove('d-none');
        this.updateRegisterBtnState();
    },

    renderSubjectIcons(grade) {
        // === 改造：在读取时过滤已删除 ===
        // 固定科目顺序表
    const SUBJECT_ORDER = [
        '语文','数学','英语','物理','化学',
        '道法','历史','生物','地理','科学','其他'
    ];

    // 过滤掉软删除科目，并且只保留该年级的科目
    let subjects = App.state.subjects.filter(
        s => !s.is_deleted && s.grades.includes(grade)
    );

    // 按 SUBJECT_ORDER 排序
    subjects.sort((a, b) => {
        const idxA = SUBJECT_ORDER.indexOf(a.name);
        const idxB = SUBJECT_ORDER.indexOf(b.name);
        return (idxA === -1 ? SUBJECT_ORDER.length : idxA) -
               (idxB === -1 ? SUBJECT_ORDER.length : idxB);
    });

    if (!this.subjectIconsContainer) return;
    if (subjects.length === 0) {
        this.subjectIconsContainer.innerHTML =
            `<small class="text-muted">该年级暂未登记科目，请在右上角【科目管理】登记科目</small>`;
        return;
    }

    // 渲染排序后的科目标签
    this.subjectIconsContainer.innerHTML = subjects.map(s => `
        <div class="subject-icon" data-subject-id="${s.id}" data-subject-name="${s.name}">
            <i class="fas fa-book-open"></i><span>${s.name}</span>
        </div>
    `).join('');    
    
    },

    handleSubjectSelection(e) {
        const icon = e.target.closest && e.target.closest('.subject-icon');
        if (!icon) return;
        
        // 切换选中状态
        icon.classList.toggle('selected');
        const isSelected = icon.classList.contains('selected'); // 标记当前是否是“选中”操作

        // 重新渲染输入框区域
        this.renderTaskInputsForSelectedSubjects();
        this.updateRegisterBtnState();

        // === 核心修改：如果是选中操作，则聚焦到对应科目的第一个输入框 ===
        if (isSelected) {
            const subjectId = icon.dataset.subjectId;
            // 在输入容器中找到对应科目的分组
            const group = this.multiSubjectTaskContainer.querySelector(`.subject-task-group[data-subject-id="${subjectId}"]`);
            
            if (group) {
                // 找到该分组下的第一个输入框
                const firstInput = group.querySelector('.homework-task-input');
                if (firstInput) {
                    // 稍微延迟一下确保 DOM 渲染完全就绪（虽然通常同步渲染即可，但在某些动画或复杂布局中 requestAnimationFrame 更稳妥）
                    // 这里直接 focus 通常也可以，但为了保险起见：
                    firstInput.focus();
                }
            }
        }
        // === 修改结束 ===
    },

// *** (优化) ***
                // 使用缓存的 DOM 元素
                _openBulkInputModal(ctx) {
                    this._bulkContext = ctx;

                    // 填充标题与科目名 (使用缓存元素)
                    if (this._bulkSubjectNameInput) this._bulkSubjectNameInput.value = ctx.subjectName || '';
                    if (this._bulkTextarea) this._bulkTextarea.value = '';
                    if (this._bulkPreview) this._bulkPreview.innerHTML = '<span class="text-muted">点击“预览分行”查看识别结果</span>';

                    

                    // 实时预览：监听输入事件
                    if (this._bulkTextarea) {
                        this._bulkTextarea.oninput = () => this._previewBulkInput();
                        this._bulkTextarea.onpaste = () => {
                            setTimeout(() => this._previewBulkInput(), 0);
                        };
                    }

                    if (this._bulkPreview) {
                        this._bulkPreview.innerHTML = '<span class="text-muted">此处实时显示左侧编辑结果</span>';
                    }

                    this._bulkModal.show();
                },

                // *** (优化) ***
                // 使用缓存的 DOM 元素
                _previewBulkInput() {
                    const textArea = this._bulkTextarea;
                    const preview = this._bulkPreview;
                    if (!textArea || !preview) return;
                    // ... (内部逻辑无变更) ...
                    const lines = textArea.value
                        .split(/\r?\n/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);

                    if (lines.length === 0) {
                        preview.innerHTML = '<span class="text-danger">未识别到有效行。请粘贴整段文本后点击“预览分行”。</span>';
                        return;
                    }
                    preview.innerHTML = lines.map((line) => `
                    <div class="d-flex align-items-start mb-1">
                        <span class="me-2" style="font-size:1.2rem; line-height:1;">•</span>
                        <span class="flex-grow-1 border rounded px-2 py-1" style="background:#fff; text-align:left;">
                        ${this._escapeHtml(line)}
                        </span>
                    </div>
                    `).join('');
                },

// *** (优化) ***
                // 使用缓存的 DOM 元素
                _confirmBulkInput() {
                    const textArea = this._bulkTextarea;
                    if (!textArea || !this._bulkContext) return;
                    // ... (内部逻辑无变更) ...
                    const lines = textArea.value
                        .split(/\r?\n/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    if (lines.length === 0) {
                        UIModule.showToast('未识别到有效行，已取消提交。', 'error');
                        return;
                    }
                    // ... (后续填充逻辑无变更) ...
                    const { targetBox } = this._bulkContext;
                    const tasksContainer = targetBox.querySelector('.tasks-for-subject');
                    if (!tasksContainer) {
                        UIModule.showToast('目标科目容器不存在，提交失败。', 'error');
                        return;
                    }
                    const inputs = Array.from(tasksContainer.querySelectorAll('.homework-task-input'));
                    const createInputGroup = (value) => {
                        const group = document.createElement('div');
                        group.className = 'input-group mb-2';
                        group.innerHTML = `
                        <input type="text" class="form-control homework-task-input"
                                value="${this._escapeHtmlAttr(value)}"
                                placeholder="请输入作业内容">
                        <button class="btn btn-outline-danger delete-homework-task-btn" type="button">
                            <i class="fas fa-times"></i>
                        </button>
                        `;
                        return group;
                    };
                    let remaining = [...lines]; 
                    if (inputs.length > 0) {
                        inputs.forEach(input => {
                        if (remaining.length === 0) return;
                        const current = (input.value || '').trim();
                        if (current === '') {
                            const nextValue = remaining.shift();
                            input.value = nextValue;
                        }
                        });
                    }
                    while (remaining.length > 0) {
                        const nextValue = remaining.shift();
                        tasksContainer.appendChild(createInputGroup(nextValue));
                    }
                    if (this._bulkModal) this._bulkModal.hide();
                    UIModule.showToast('已完成填入', 'success');
                    this.updateRegisterBtnState();
                },


_escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
},
_escapeHtmlAttr(str) {
  // 供 value="" 属性安全使用
  return this._escapeHtml(str);
},



// *** (优化) ***
                // 使用缓存的 DOM 元素
                async _openOCRModal(ctx) {

                    // --- (新) 动态加载 Tesseract 脚本 ---
    // 1. 检查脚本是否已加载
    if (!this._ocrScriptLoaded) {
        // 2. 检查是否 *正在* 加载 (防止用户快速连点)
        if (this._ocrScriptLoading) {
            UIModule.showToast('正在加载识别引擎，请稍候...', 'info');
            return; // 中断执行
        }

        // 3. 开始加载
        try {
            this._ocrScriptLoading = true; // 标记为“正在加载”
            UIModule.showToast('首次使用，正在加载图片识别引擎...', 'info', 'center');

            // (关键) 等待脚本加载完成
            await this._loadTesseractScript(); 

            UIModule.showToast('引擎加载完毕！', 'success', 'center');
        } catch (e) {
            // 加载失败
            UIModule.showToast('图片识别引擎加载失败，请刷新页面重试。', 'error', 'center');
            this._ocrScriptLoading = false; // 重置加载状态
            return; // 中断执行
        }
    }
    // --- (新) 加载代码结束 ---

                    this._ocrCtx = ctx;

                    // 使用缓存的元素
                    const nameInput = this._ocrSubjectNameInput;
                    const dropzone = this._ocrDropzone;
                    const imgPreview = this._ocrImagePreview;
                    const textarea = this._ocrResultTextarea;
                    const previewBox = this._ocrResultPreview;
                    const progressFlag = this._ocrProgressFlag;

                    if (nameInput) nameInput.value = ctx.subjectName || '';
                    if (imgPreview) { imgPreview.src = ''; imgPreview.classList.add('d-none'); }
                    if (textarea) textarea.value = '';
                    if (previewBox) previewBox.innerHTML = '';
                    if (progressFlag) progressFlag.classList.add('d-none');
                    this._ocrRunning = false;


  // Bind paste & drag/drop for single image
  const handleImageFile = (fileOrBlob) => {
    if (!fileOrBlob) return;
    const type = (fileOrBlob.type || '').toLowerCase();
    if (!type.startsWith('image/')) {
      UIModule.showToast('仅支持图片文件（JPG/PNG）。', 'error');
      return;
    }
    const reader = new FileReader();
                        reader.onload = () => {
                        imgPreview.src = reader.result;
                        imgPreview.classList.remove('d-none');
                        textarea.value = '';
                        this._startOCR(reader.result, (text) => {
                            textarea.value = text || '';
                            this._renderOCRPreview();
                        }, (state, pct) => {
                            if (!progressFlag) return;
                            progressFlag.classList.remove('d-none', 'done', 'error');
                            if (state === 'running') {
                            this._ocrProgressText.textContent = typeof pct === 'number' ? `识别中… ${Math.round(pct * 100)}%` : '识别中…';
                            } else if (state === 'done') {
                            progressFlag.classList.add('done');
                            this._ocrProgressText.textContent = '识别完成';
                            setTimeout(() => progressFlag.classList.add('d-none'), 1500);
                            } else if (state === 'error') {
                            progressFlag.classList.add('error');
                            this._ocrProgressText.textContent = '识别失败';
                            }
                        });
                        };
                        reader.readAsDataURL(fileOrBlob);
                    };
                    dropzone.onpaste = (ev) => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        handleImageFile(blob);
        break; // only one image
      }
    }
  };

  // Drag & drop
  dropzone.ondragover = (ev) => { ev.preventDefault(); dropzone.classList.add('dragover'); };
                    dropzone.ondragleave = () => { dropzone.classList.remove('dragover'); };
                    dropzone.ondrop = (ev) => {
    ev.preventDefault();
    dropzone.classList.remove('dragover');
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  // Live preview on text edit
  textarea.oninput = () => this._renderOCRPreview();
                    this._ocrModal.show();
},

// (这是新的、优化过的 _startOCR 函数)
async _startOCR(dataUrl, onDone, onProgress) {
    if (this._ocrRunning) return;
    this._ocrRunning = true;
    onProgress && onProgress('running', 0);

    try {
        // 1. (优化) 检查是否已经创建了 Tesseract Worker
        if (!this._tesseractWorker) {
            UIModule.showToast('正在初始化识别核心(首次)...', 'info');

            // 2. 如果没有，就创建一个新的
            this._tesseractWorker = await Tesseract.createWorker('chi_sim+eng', 1, {
                logger: (m) => {
                    // 仅在识别文本时才更新进度条
                    if (m.status === 'recognizing text') {
                        onProgress && onProgress('running', m.progress);
                    }
                }
            });
            UIModule.showToast('识别核心初始化完毕！', 'success');
        }

        // 3. (优化) 使用缓存的 Worker 进行识别
        const { data: { text } } = await this._tesseractWorker.recognize(dataUrl);

        onDone && onDone(text || '');
        onProgress && onProgress('done', 1);

    } catch (err) {
        console.error('OCR error:', err);
        UIModule.showToast('图片识别失败，请重试。', 'error');
        onProgress && onProgress('error', 0);

        // (优化) 如果 Worker 出错了，就销毁它，下次重建
        if (this._tesseractWorker) {
            await this._tesseractWorker.terminate();
            this._tesseractWorker = null;
        }
    } finally {
        this._ocrRunning = false;
    }
},

// *** (优化) ***
                // 使用缓存的 DOM 元素
                _renderOCRPreview() {
                    const textarea = this._ocrResultTextarea;
                    const preview = this._ocrResultPreview;
                    if (!textarea || !preview) return;

                    const lines = textarea.value
                        .split(/\r?\n/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    if (lines.length === 0) {
                        preview.innerHTML = '<span class="text-danger">未识别到有效行。</span>';
                        return;
                    }
                    preview.innerHTML = lines.map((line) => `
                        <div class="d-flex align-items-start mb-1">
                        <span class="me-2" style="font-size:1.2rem; line-height:1;">•</span>
                        <span class="flex-grow-1 border rounded px-2 py-1" style="background:#fff; text-align:left;">
                            ${this._escapeHtml(line)}
                        </span>
                        </div>
                    `).join('');
                },

                // *** (优化) ***
                // 使用缓存的 DOM 元素
                _confirmOCRInput() {
                    const textarea = this._ocrResultTextarea;
                    if (!textarea || !this._ocrCtx) return;
                    // ... (内部逻辑无变更) ...
                    const lines = textarea.value
                        .split(/\r?\n/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    if (lines.length === 0) {
                        UIModule.showToast('未识别到有效行，已取消提交。', 'error');
                        return;
  }

  const { targetBox } = this._ocrCtx;
                    const tasksContainer = targetBox.querySelector('.tasks-for-subject');
                    if (!tasksContainer) {
                        UIModule.showToast('目标科目容器不存在，提交失败。', 'error');
                        return;
  }

  // Existing inputs
  const inputs = Array.from(tasksContainer.querySelectorAll('.homework-task-input'));
                    const createInputGroup = (value) => {
    const group = document.createElement('div');
    group.className = 'input-group mb-2';
    group.innerHTML = `
      <input type="text" class="form-control homework-task-input"
             value="${this._escapeHtmlAttr(value)}"
             placeholder="请输入作业内容">
      <button class="btn btn-outline-danger delete-homework-task-btn" type="button">
        <i class="fas fa-times"></i>
      </button>
    `;
    return group;
  };

  let remaining = [...lines];

  // Fill empty inputs first
  if (inputs.length > 0) {
    inputs.forEach(input => {
      if (remaining.length === 0) return;
      const current = (input.value || '').trim();
      if (current === '') {
        const nextValue = remaining.shift();
        input.value = nextValue;
      }
    });
  }

  // Append any leftover as new inputs
  while (remaining.length > 0) {
    const nextValue = remaining.shift();
    tasksContainer.appendChild(createInputGroup(nextValue));
  }

  // Close modal, notify, refresh button state
  if (this._ocrModal) this._ocrModal.hide();
  UIModule.showToast('已完成填入', 'success');
  this.updateRegisterBtnState();
},


    renderTaskInputsForSelectedSubjects() {
        if (!this.multiSubjectTaskContainer || !this.subjectIconsContainer) return;
        const selectedIcons = Array.from(this.subjectIconsContainer.querySelectorAll('.subject-icon.selected'));
        const existingGroups = Array.from(this.multiSubjectTaskContainer.querySelectorAll('.subject-task-group'));

        const selectedIds = new Set(selectedIcons.map(i => i.dataset.subjectId));
        const existingIds = new Set(existingGroups.map(g => g.dataset.subjectId));

        // remove groups no longer selected
        existingGroups.forEach(g => { if (!selectedIds.has(g.dataset.subjectId)) g.remove(); });

        // add missing groups
        selectedIcons.forEach(icon => {
            const sid = icon.dataset.subjectId;
            if (existingIds.has(sid)) return;
            const name = icon.dataset.subjectName || '';
            const box = document.createElement('div');
            box.className = 'subject-task-group';
            box.dataset.subjectId = sid;
            box.innerHTML = `
                <label class="form-label">${name}</label>
                <div class="tasks-for-subject">
                    <div class="input-group mb-2">
                        <input type="text" class="form-control homework-task-input" placeholder="请输入作业内容">
                        <button class="btn btn-outline-danger delete-homework-task-btn" type="button"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="mt-2 d-flex justify-content-start align-items-center" style="gap: 1rem;">
  <button class="btn btn-sm btn-outline-secondary add-task-for-subject-btn" type="button">+ 添加一项</button>
  <button class="btn btn-sm btn-outline-primary bulk-input-for-subject-btn" type="button">整段输入</button>
  <button class="btn btn-sm btn-outline-success ocr-input-for-subject-btn" type="button">图片识别</button>
</div>
 `;
            this.multiSubjectTaskContainer.appendChild(box);
        });

        const any = selectedIcons.length > 0;
        this.taskSection && this.taskSection.classList.toggle('d-none', !any);
    },

    // === (修复) ===
    // 下方的 handleTaskSectionClick 函数已被新的 init() 逻辑取代，
    // 功能重复，故安全删除。
    // === (修复结束) ===

    renderClassmateTags(grade, currentStudentId) {
        if (!this.classmateTags) return;
        // === 改造：在读取时过滤已删除 ===
        const classmates = App.state.students.filter(s => !s.is_deleted && s.grade === grade && s.id !== currentStudentId);
        this.classmateTags.innerHTML = classmates.length > 0 ? classmates.map(s => `<div class="classmate-tag" data-student-id="${s.id}">${s.name}</div>`).join('') : '';
    },

    handleClassmateTagClick(e) {
        const tag = e.target.closest && e.target.closest('.classmate-tag');
        if (!tag) return;
        tag.classList.toggle('selected');
    },

    updateRegisterBtnState() {
        const hasStudent = !!this.selectedStudentId;
        const hasSubjects = this.subjectIconsContainer && this.subjectIconsContainer.querySelectorAll('.subject-icon.selected').length > 0;
        this.registerBtn && (this.registerBtn.disabled = !(hasStudent && hasSubjects));
    },

    // 在 HomeworkModule 内部替换 handleRegister 函数，修复给同一学生同一科目多次登记时的任务序号问题
handleRegister() {
    if (!this.selectedStudentId) { UIModule.showToast('请选择学生再登记作业', 'error', 'center'); return; }
    const groups = Array.from(this.multiSubjectTaskContainer.querySelectorAll('.subject-task-group'));
    if (groups.length === 0) { UIModule.showToast('请选择至少一个科目并填写任务', 'error', 'center'); return; }

    const classmateIds = Array.from(this.classmateTags.querySelectorAll('.classmate-tag.selected')).map(t => t.dataset.studentId);
    // 所有需要登记作业的学生ID列表
    const allTargetIds = [this.selectedStudentId, ...classmateIds];

    const today = getBeijingDateString();
    let added = 0;

    // 遍历每一个被选中的科目组
    groups.forEach(g => {
        const sid = g.dataset.subjectId;
        // 获取当前输入框里的任务文本
        const tasks = Array.from(g.querySelectorAll('.homework-task-input')).map(i => i.value.trim()).filter(Boolean);

        if (tasks.length === 0) return; // 如果该科目没有填任务，跳过

        // === 核心修复开始：预先计算每个学生在该科目的“起始序号” ===
        // 我们创建一个 Map，用来存储每个学生当前应该从哪个序号开始写
        const studentNextOrderMap = {};

        allTargetIds.forEach(studentId => {
            // 1. 查找该学生、该科目、今天 已存在的未删除作业
            const existingTasks = App.state.homeworks.filter(h => 
                !h.is_deleted &&
                h.studentId === studentId &&
                h.subjectId === sid &&
                h.date === today
            );
            
            // 2. 找到已存在的最大序号 (如果没有，默认为 -1)
            const maxOrder = existingTasks.reduce((max, h) => Math.max(max, h.task_order || 0), -1);
            
            // 3. 下一条作业的起始序号应该是 maxOrder + 1
            studentNextOrderMap[studentId] = maxOrder + 1;
        });
        // === 核心修复结束 ===

        // 开始遍历当前输入的任务
        tasks.forEach((t) => {
            // 遍历每一个目标学生
            allTargetIds.forEach(studentId => {
                // 获取该学生当前的序号
                const currentOrder = studentNextOrderMap[studentId];

                App.state.homeworks.push({ 
                    id: App.generateId(), 
                    studentId, 
                    subjectId: sid, 
                    task: t, 
                    status: '未完成', 
                    date: today, 
                    is_deleted: false,
                    task_order: currentOrder // <--- 使用累加计算后的序号，不再使用循环索引
                });
                
                // 登记完一条后，该学生的“下一个序号”自增，为下一条任务做准备
                studentNextOrderMap[studentId]++;
                added++;
            });
        });
    });

    if (added === 0) { UIModule.showToast('请输入至少一项有效任务', 'error', 'center'); return; }

    App.saveState();
    UIModule.showToast(`已登记 ${added} 项作业（含同时登记给同学）。`, 'success');
    this.resetRegistrationForm();
    requestAnimationFrame(() => {
        this.renderHomeworkCards();
        ProgressModule.render();
        LargeScreenModule.render();
    });
},

    resetRegistrationForm(soft = false) {
        this.selectedStudentId = null;
        if (!soft && this.selectStudentInput) this.selectStudentInput.value = '';
        this.subjectIconsContainer && this.subjectIconsContainer.querySelectorAll('.subject-icon.selected').forEach(i => i.classList.remove('selected'));
        this.multiSubjectTaskContainer && (this.multiSubjectTaskContainer.innerHTML = '');
        this.classmateTags && (this.classmateTags.innerHTML = '');
        this.subjectSection && this.subjectSection.classList.add('d-none');
        this.taskSection && this.taskSection.classList.add('d-none');
        this.classmatesContainer && this.classmatesContainer.classList.add('d-none');
        this.updateRegisterBtnState();
    },

    // main rendering: respect start/end range and expose App.currentFilter
    renderHomeworkCards() {
    const { start, end } = normalizeDateRange(this.filterStartDate, this.filterEndDate); //

    // --- (核心修改：步骤 1) ---
    // (A) 我们把“计算过滤器”的逻辑从下面移动到这里
    const studentFilters = this.filterStudentNameContainer
        ? Array.from(this.filterStudentNameContainer.querySelectorAll('input[name="filterStudentName"]:checked')).map(cb => cb.value) //
        : [];

    // (B) 同样，计算状态过滤器
    const statusFilters = this.filterCompletionStatusContainer
        ? Array.from(this.filterCompletionStatusContainer.querySelectorAll('input[name="filterCompletionStatus"]:checked')).map(cb => cb.value) //
        : [];
        
    // --- (核心修改：步骤 2) ---
    // (C) 现在，我们将 *所有* 筛选条件存入全局的 App.currentFilter
    App.currentFilter = { start, end, studentFilters, statusFilters };
    // (原来的 App.currentFilter = { start, end }; 已被替换)


    // === 改造：在读取时过滤已删除 ===
    let list = App.state.homeworks.filter(h => !h.is_deleted && h.date >= start && h.date <= end); //

    // (D) 应用学生ID筛选 (这段逻辑你已有了，保持不变)
    if (studentFilters.length > 0) {
        list = list.filter(h => studentFilters.includes(h.studentId)); //
    }

    // (E) 应用状态筛选 (这段逻辑你已有了，保持不变)
    if (statusFilters.length > 0) {
        list = list.filter(h => statusFilters.includes(h.status)); //
    }
    // --- (核心修改结束) ---

    const studentIds = [...new Set(list.map(h => h.studentId))]; //
    if (!this.homeworkListContainer) return; //
    if (studentIds.length === 0) {  //
        this.homeworkListContainer.innerHTML = '<div class="text-center text-muted mt-5">当前日期范围内暂无作业记录</div>'; //
        return; 
    }

    // 构建查找映射，避免重复 find
    // === 改造：在读取时过滤已删除 ===
    const subjectMap = new Map(App.state.subjects.filter(s => !s.is_deleted).map(s => [s.id, s])); //
    const studentMap = new Map(App.state.students.filter(s => !s.is_deleted).map(s => [s.id, s])); //

    const todayStr = getBeijingDateString(); //
    const isTodayRange = (start === todayStr && end === todayStr); //

    // ✅ 固定科目顺序表
    const SUBJECT_ORDER = [
        '语文','数学','英语','物理','化学',
        '道法','历史','生物','地理','科学','其他'
    ]; //

    const html = studentIds.map(studentId => {
        const student = studentMap.get(studentId) || { name: '未知', grade: '' }; //
        const studentHomeworks = list.filter(h => h.studentId === studentId); //

        const bySubject = studentHomeworks.reduce((acc, hw) => {
            const subject = subjectMap.get(hw.subjectId); //
            const name = subject ? subject.name : '未知科目'; //
            (acc[name] = acc[name] || []).push(hw); //
            return acc;
        }, {});

        // ✅ 按 SUBJECT_ORDER 排序科目分组
        const orderedSubjects = Object.entries(bySubject).sort(([aName], [bName]) => {
            const idxA = SUBJECT_ORDER.indexOf(aName); //
            const idxB = SUBJECT_ORDER.indexOf(bName); //
            return (idxA === -1 ? SUBJECT_ORDER.length : idxA) -
                   (idxB === -1 ? SUBJECT_ORDER.length : idxB);
        }); //

        const subjectsHtml = orderedSubjects.map(([subjectName, hws]) => {
            // === 修复：在处理 hws 数组前，对其排序 ===
        hws.sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
        // === 修复结束 ===
            if (isTodayRange) { //
                // === 保持原有样式 ===
                return `
                <div class="homework-subject-group">
                    <div class="homework-subject-title">
                        <span>${subjectName}</span>
                        <div class="action-icons">
                            <i class="fas fa-copy" data-action="copy-subject-tasks" data-student-id="${studentId}" data-subject-name="${encodeURIComponent(subjectName)}" title="复制本科目到同年级"></i>
                        </div>
                    </div>
                    ${hws.map(hw => `
                        <div class="homework-item">
                            <div class="homework-text">${hw.task}</div>
                            <div class="homework-actions-wrapper">
                                <select class="form-select form-select-sm homework-status-select" data-homework-id="${hw.id}">
                                    <option value="未完成" ${hw.status === '未完成' ? 'selected' : ''}>未完成</option>
                                    <option value="部分完成" ${hw.status === '部分完成' ? 'selected' : ''}>部分完成</option>
                                    <option value="已完成" ${hw.status === '已完成' ? 'selected' : ''}>已完成</option>
                                </select>
                                <div class="action-icons">
                                    <i class="fas fa-edit" data-action="edit-task" data-homework-id="${hw.id}" title="编辑"></i>
                                    <i class="fas fa-copy" data-action="copy-task" data-homework-id="${hw.id}" title="复制此条到同年级"></i>
                                    <i class="fas fa-trash-alt" data-action="delete-task" data-homework-id="${hw.id}" title="删除"></i>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>`; //
            } else {
                // === 新样式：科目下再按日期分组 ===
                const byDate = hws.reduce((acc, hw) => {
                    (acc[hw.date] = acc[hw.date] || []).push(hw); //
                    return acc;
                }, {});

                // ✅ 按日期升序排序
                const orderedDates = Object.entries(byDate).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)); //

                return `
                <div class="homework-subject-group">
                    <div class="homework-subject-title">
                        <span>${subjectName}</span>
                        <div class="action-icons">
                            <i class="fas fa-copy" data-action="copy-subject-tasks" data-student-id="${studentId}" data-subject-name="${encodeURIComponent(subjectName)}" title="复制本科目到同年级"></i>
                        </div>
                    </div>
                    ${orderedDates.map(([date, dateHws]) =>{
                        
                        // === 修复：对 dateHws 数组排序 ===
                    dateHws.sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
                    // === 修复结束 ===

                    return `
                        <div class="homework-date-group">
                            <div class="text-muted mb-1" style="font-size:0.85rem;">${date}</div>
                            ${dateHws.map(hw => `
                                <div class="homework-item">
                                    <div class="homework-text">${hw.task}</div>
                                    <div class="homework-actions-wrapper">
                                        <select class="form-select form-select-sm homework-status-select" data-homework-id="${hw.id}">
                                            <option value="未完成" ${hw.status === '未完成' ? 'selected' : ''}>未完成</option>
                                            <option value="部分完成" ${hw.status === '部分完成' ? 'selected' : ''}>部分完成</option>
                                            <option value="已完成" ${hw.status === '已完成' ? 'selected' : ''}>已完成</option>
                                        </select>
                                        <div class="action-icons">
                                            <i class="fas fa-edit" data-action="edit-task" data-homework-id="${hw.id}" title="编辑"></i>
                                            <i class="fas fa-copy" data-action="copy-task" data-homework-id="${hw.id}" title="复制此条到同年级"></i>
                                            <i class="fas fa-trash-alt" data-action="delete-task" data-homework-id="${hw.id}" title="删除"></i>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}).join('')}
                </div>`; //
            }
        }).join('');

        return `
            <div class="student-homework-card">
                <div class="student-homework-card-header">
                    <span>${formatStudentHeader(student.name, student.grade)} (${formatDateRangeLabel(start, end)})</span>
                    <div class="action-icons">
                        <i class="fas fa-print" data-action="print" data-student-id="${studentId}" title="打印"></i>
                        <i class="fas fa-copy" data-action="copy-student-homework" data-student-id="${studentId}" title="复制到剪贴板"></i>
                        <i class="fas fa-trash-alt" data-action="delete-student-homework" data-student-id="${studentId}" title="删除"></i>
                    </div>
                </div>
                <div class="student-homework-card-body">${subjectsHtml}</div>
            </div>
        `; //
    }).join('');

    this.homeworkListContainer.innerHTML = html; //

    // propagate to other modules
    requestAnimationFrame(() => {
        try { ProgressModule.render(); } catch (err) { console.warn('ProgressModule.render error', err); } //
        try { 
            if (document.fullscreenElement) { //
                LargeScreenModule.updateLiveContent(App.state.homeworks); //
            } else {
                LargeScreenModule.render(); //
            }
        } catch (err) { console.warn('LargeScreenModule render/update error', err); }
    }); //
},

    handleCardActions(e) {
        const icon = e.target.closest && e.target.closest('[data-action]');
        if (!icon) return;
        const action = icon.dataset.action;
        const studentId = icon.dataset.studentId;
        const homeworkId = icon.dataset.homeworkId;
        const subjectName = icon.dataset.subjectName ? decodeURIComponent(icon.dataset.subjectName) : null;

        if (action === 'print') return this.handlePrint(studentId);
        if (action === 'delete-student-homework') return this.handleDeleteStudentHomework(studentId);
        if (action === 'edit-task') return this.handleEditTask(homeworkId);
        if (action === 'delete-task') return this.handleDeleteTask(homeworkId);
        if (action === 'copy-task') return this.handleCopyTask(homeworkId);
        if (action === 'copy-subject-tasks') return this.handleCopySubjectTasks(studentId, subjectName);
        if (action === 'copy-student-homework') return this.handleCopyStudentHomework(studentId);
    },

    handleStatusChange(e) {
        const sel = e.target.closest && e.target.closest('.homework-status-select');
        if (!sel) return;
        const hwId = sel.dataset.homeworkId;
        const hw = App.state.homeworks.find(h => h.id === hwId && !h.is_deleted);
        if (!hw) return;
        hw.status = sel.value;
        App.saveState();
        UIModule.showToast('状态已更新', 'success');
        ProgressModule.render();
        if (document.fullscreenElement) LargeScreenModule.updateLiveContent(App.state.homeworks);
        else LargeScreenModule.render();
    },

    // edit single task
    handleEditTask(homeworkId) {
        const hw = App.state.homeworks.find(h => h.id === homeworkId && !h.is_deleted);
        if (!hw) return;
        const html = `<div class="mb-3"><label class="form-label">作业内容</label><textarea id="editHomeworkTask" class="form-control" rows="4">${hw.task}</textarea></div>`;
        UIModule.showEditModal('编辑作业', html, () => {
            const v = document.getElementById('editHomeworkTask').value.trim();
            if (!v) { UIModule.showToast('作业内容不能为空', 'error', 'center'); return false; }
            hw.task = v;
            App.saveState();
            UIModule.showToast('作业已更新', 'success');
            this.renderHomeworkCards();
            return true;
        });
    },


    // duplicate single homework to selected classmates
    handleCopyTask(homeworkId) {
        // === 改造：在读取时过滤已删除 ===
        const hw = App.state.homeworks.filter(h => !h.is_deleted).find(h => h.id === homeworkId);
        if (!hw) return;
        const originStudent = App.state.students.filter(s => !s.is_deleted).find(s => s.id === hw.studentId);
        if (!originStudent) return;
        const classmates = App.state.students.filter(s => !s.is_deleted && s.grade === originStudent.grade && s.id !== originStudent.id);
        if (classmates.length === 0) { UIModule.showToast('没有可复制的同年级学生', 'info'); return; }

        const form = `<p>选择要复制到的同学：</p><div id="copyToClassmates" class="classmate-tags">${classmates.map(s => `<div class="classmate-tag" data-student-id="${s.id}">${s.name}</div>`).join('')}</div>`;
        const title = `将 ${originStudent.name} 的作业复制给...`;
        UIModule.showEditModal(title, form, () => {
            const ids = Array.from(document.querySelectorAll('#copyToClassmates .classmate-tag.selected')).map(t => t.dataset.studentId);
            if (ids.length === 0) { UIModule.showToast('请至少选择一名同学', 'error', 'center'); return false; }
            ids.forEach(id => {
                // --- (修复V2：计算目标学生的下一个 task_order) ---
                
                // 1. 查找B同学在当天、本科目的所有“已存在”作业
                const existingTasks = App.state.homeworks.filter(h => 
                    !h.is_deleted &&
                    h.studentId === id &&
                    h.subjectId === hw.subjectId &&
                    h.date === hw.date
                );

                // 2. 找到已有的最大 order (如果B同学没有作业，则 maxOrder 为 -1)
                const maxOrder = existingTasks.reduce((max, current) => {
                    return Math.max(max, current.task_order || 0);
                }, -1); 

                // 3. 新作业的 order 应该是 max + 1
                const newOrder = maxOrder + 1;
                // --- (修复结束) ---
                // App.state.homeworks.push({ id: App.generateId(), studentId: id, subjectId: hw.subjectId, task: hw.task, status: '未完成', date: hw.date, is_deleted: false });
                App.state.homeworks.push({ 
                id: App.generateId(), 
                studentId: id, 
                subjectId: hw.subjectId, 
                task: hw.task, 
                status: '未完成', 
                date: hw.date, 
                is_deleted: false,
                task_order: newOrder // <-- 修复：使用计算出的新顺序
            });
            });
            App.saveState();
            UIModule.showToast(`已复制给 ${ids.length} 名同学`, 'success');
            this.renderHomeworkCards();
            ProgressModule.render();
            LargeScreenModule.render();
            return true;
        });
        document.getElementById('copyToClassmates').addEventListener('click', e => {
            const t = e.target.closest && e.target.closest('.classmate-tag');
            if (t) t.classList.toggle('selected');
        });
    },

    // duplicate all tasks of a subject for a student to selected classmates (respect current filter range)
    handleCopySubjectTasks(studentId, subjectName) {
        // === 改造：在读取时过滤已删除 ===
        const subject = App.state.subjects.filter(s => !s.is_deleted).find(s => s.name === subjectName);
        if (!subject) { UIModule.showToast('未找到该科目', 'error', 'center'); return; }

        // date range
        const { start, end } = normalizeDateRange(this.filterStartDate, this.filterEndDate);

        // === 改造：在读取时过滤已删除 ===
        const tasks = App.state.homeworks.filter(h => !h.is_deleted && h.studentId === studentId && h.subjectId === subject.id && h.date >= start && h.date <= end);
        if (tasks.length === 0) { UIModule.showToast('所选范围内无该科目作业', 'info', 'center'); return; }

        // === 改造：在读取时过滤已删除 ===
        const originStudent = App.state.students.filter(s => !s.is_deleted).find(s => s.id === studentId);
        const classmates = App.state.students.filter(s => !s.is_deleted && s.grade === originStudent.grade && s.id !== originStudent.id);
        if (classmates.length === 0) { UIModule.showToast('没有可复制的同年级学生', 'info', 'center'); return; }

        const form = `<p>将 "${subjectName}" 的 ${tasks.length} 项作业复制给：</p><div id="copyToClassmates" class="classmate-tags">${classmates.map(s => `<div class="classmate-tag" data-student-id="${s.id}">${s.name}</div>`).join('')}</div>`;
        const title = `将 ${originStudent.name} 的 "${subjectName}" 复制给...`;
        UIModule.showEditModal(title, form, () => {
            const ids = Array.from(document.querySelectorAll('#copyToClassmates .classmate-tag.selected')).map(t => t.dataset.studentId);
            if (ids.length === 0) { UIModule.showToast('请至少选择一名同学', 'error', 'center'); return false; }
            let cnt = 0;

            // === (V2 修复开始) ===

            // 1. 确保源任务(tasks)按 'task_order' 排序，以便我们按顺序追加它们
            // (tasks 变量在外部函数作用域中已定义)
            const sortedSourceTasks = [...tasks].sort((a, b) => (a.task_order || 0) - (b.task_order || 0));

            // 2. 从源任务中获取 subjectId (它们都属于同一个科目)
            // (subject 变量也在外部函数作用域中已定义)
            const subjectId = subject.id;

            // 3. 获取日期范围
            // (start 和 end 变量也在外部函数作用域中已定义)

                ids.forEach(id => { // 'id' 是目标学生 (B同学) 的 ID

                // --- (修复V2：计算目标学生的下一个 task_order) ---
                const subjectId = tasks.length > 0 ? tasks[0].subjectId : null;
                if (!subjectId) return; // 如果源任务为空，则跳过

                // 1. 查找B同学在该日期范围、本科目的所有“已存在”作业
                const existingTasks = App.state.homeworks.filter(h =>
                    !h.is_deleted &&
                    h.studentId === id &&
                    h.subjectId === subjectId &&
                    h.date >= start &&
                    h.date <= end
                );
                
                // 2. 找到已有的最大 order
                const maxOrder = existingTasks.reduce((max, current) => {
                    return Math.max(max, current.task_order || 0);
                }, -1);

                // 3. 这是新作业的“起始” order
                let nextOrder = maxOrder + 1;
                // --- (修复结束) ---

                // 4. 确保A同学的源任务是按顺序的，这样复制过去也是按顺序追加
                const sortedSourceTasks = [...tasks].sort((a, b) => (a.task_order || 0) - (b.task_order || 0));

                sortedSourceTasks.forEach(t => { // 't' 是源作业 (A同学)
                    App.state.homeworks.push({ 
                        id: App.generateId(), 
                        studentId: id, 
                        subjectId: t.subjectId, 
                        task: t.task, 
                        status: '未完成', 
                        date: t.date, 
                        is_deleted: false,
                        task_order: nextOrder // <-- 修复：使用递增的新顺序
                    });
                    nextOrder++; // <-- 关键：为下一条复制的任务递增 order
                    cnt++;
                });
            });
            App.saveState();
            UIModule.showToast(`已复制 ${cnt} 条作业给 ${ids.length} 名同学`, 'success');
            this.renderHomeworkCards();
            ProgressModule.render();
            LargeScreenModule.render();
            return true;
        });
        document.getElementById('copyToClassmates').addEventListener('click', e => {
            const t = e.target.closest && e.target.closest('.classmate-tag');
            if (t) t.classList.toggle('selected');
        });
    },


    // copy entire student's homework in current filter range to clipboard (human-readable)
handleCopyStudentHomework(studentId) {
    const { start, end } = normalizeDateRange(this.filterStartDate, this.filterEndDate);

    // === 修复 1：在读取时过滤已删除的学生 ===
    const student = App.state.students.filter(s => !s.is_deleted).find(s => s.id === studentId);
    if (!student) {
         UIModule.showToast('未找到该学生', 'error', 'center'); 
         return; 
    }

    // === 修复 2：在读取时过滤已删除的作业 ===
    const list = App.state.homeworks.filter(h => !h.is_deleted && h.studentId === studentId && h.date >= start && h.date <= end);
    if (list.length === 0) { 
        UIModule.showToast('该学生在所选范围内无作业', 'info', 'center'); 
        return; 
    }

    // === 修复 3：创建已过滤的科目 Map (同 handlePrint) ===
    const subjectMap = new Map(App.state.subjects.filter(s => !s.is_deleted).map(s => [s.id, s.name]));

    const bySubject = list.reduce((acc, hw) => {
    const name = subjectMap.get(hw.subjectId) || '未知科目';
    (acc[name] = acc[name] || []).push(hw); // <-- 修复：推送整个 'hw' 对象
    return acc;
    }, {});

    // (后续逻辑不变)
    const rangeLabel = formatDateRangeLabel(start, end);
    let text = `${student.name} ${student.grade ? '(' + student.grade + ')' : ''} ${rangeLabel} 作业：\n`;
    Object.entries(bySubject).forEach(([subj, tasks]) => { // 'tasks' 是 [hw, hw]
    text += `\n${subj}：\n`;
    tasks.sort((a, b) => (a.task_order || 0) - (b.task_order || 0)); // <-- 修复：添加排序
    tasks.forEach((t, i) => text += `${i + 1}. ${t.task}\n`); // <-- 修复：使用 t.task
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => UIModule.showToast('已复制到剪贴板')).catch(() => {
            const w = window.open('', '_blank'); w.document.body.textContent = text;
            UIModule.showToast('无法写入剪贴板，已在新窗口打开文本，请手动复制', 'info');
        });
    } else {
        const w = window.open('', '_blank'); w.document.body.textContent = text;
        UIModule.showToast('浏览器不支持剪贴板 API，已在新窗口打开文本，请手动复制', 'info');
    }
},

    handleDeleteTask(homeworkId) {
        UIModule.showConfirmation('删除作业', '确定要删除此条作业吗？', () => {
            // === 改造：从 filter 改为 软删除 ===
            // App.state.homeworks = App.state.homeworks.filter(h => h.id !== homeworkId); // 旧代码
            const hw = App.state.homeworks.find(h => h.id === homeworkId);
            if (hw) hw.is_deleted = true;
            // === 改造结束 ===

            App.saveState();
            UIModule.showToast('作业已删除', 'success');
            this.renderHomeworkCards();
            ProgressModule.render();
            LargeScreenModule.render();
        });
    },

    handleDeleteStudentHomework(studentId) {
        const { start, end } = normalizeDateRange(this.filterStartDate, this.filterEndDate);


        const student = App.state.students.find(s => s.id === studentId && !s.is_deleted) || { name: '未知' };
        const rangeLabel = formatDateRangeLabel(start, end);

        UIModule.showConfirmation('删除学生作业', `确认删除 ${student.name} 在 ${rangeLabel} 的所有作业吗？`, () => {
            // === 改造：从 filter 改为 软删除 ===
            // App.state.homeworks = App.state.homeworks.filter(h => !(h.studentId === studentId && h.date >= start && h.date <= end)); // 旧代码
            App.state.homeworks.forEach(h => {
                if (h.studentId === studentId && h.date >= start && h.date <= end) {
                    h.is_deleted = true;
                }
            });
            // === 改造结束 ===
            App.saveState();
            UIModule.showToast('删除成功', 'success');
            this.renderHomeworkCards();
            ProgressModule.render();
            LargeScreenModule.render();
        });
    },

    handleDeleteAll() {
        const { start, end } = normalizeDateRange(this.filterStartDate, this.filterEndDate);


        const rangeLabel = formatDateRangeLabel(start, end);
        UIModule.showPasswordPrompt(`删除 ${rangeLabel} 的全部作业`, `该操作会清空所有学生在 ${rangeLabel} 的作业信息！请输入密码确认：`, 'peiyou', () => {
            // === 改造：从 filter 改为 软删除 ===
            // App.state.homeworks = App.state.homeworks.filter(h => !(h.date >= start && h.date <= end)); // 旧代码
            App.state.homeworks.forEach(h => {
                if (h.date >= start && h.date <= end) {
                    h.is_deleted = true;
                }
            });
            // === 改造结束 ===
            App.saveState();
            UIModule.showToast(`${rangeLabel} 的所有作业已清空！`, 'success');
            App.renderAll();
        });
    },

    handlePrint(studentId) {

    // 统一日期/时间/星期
  const dateStr = getBeijingDateString();
  const timeStr = getBeijingTimeString();
  // === (修复) ===
  // 修复：确保 weekdayStr 也是基于北京时间计算，而不是本地时间
  const weekdayStr = WEEKDAYS[toBeijingDate(new Date()).getDay()]; 
  // === (修复结束) ===
  const headerLine = `${dateStr} ${weekdayStr} ${timeStr}`;

    const { start, end } = normalizeDateRange(this.filterStartDate, this.filterEndDate);


    const student = App.state.students.find(s => s.id === studentId && !s.is_deleted) || { name: '未知', grade: '' };
    
    // === 改造点 1：过滤软删除的作业 ===
    const hwList = App.state.homeworks.filter(h => !h.is_deleted && h.studentId === studentId && h.date >= start && h.date <= end);

    // === 改造点 2：创建过滤软删除科目的 Map (提高健壮性) ===
    const subjectMap = new Map(App.state.subjects.filter(s => !s.is_deleted).map(s => [s.id, s.name]));

    const grouped = hwList.reduce((acc, hw) => {
    const subjName = subjectMap.get(hw.subjectId) || '未知科目';

    if (!acc[subjName]) acc[subjName] = {};
    const dateKey = new Date(hw.date).toISOString().slice(0,10); // YYYY-MM-DD
    (acc[subjName][dateKey] = acc[subjName][dateKey] || []).push(hw); // <-- 修复：推送整个 'hw' 对象
    return acc;
    }, {});
    
    const rangeLabel = formatDateRangeLabel(start, end);


    const todayKey = new Date().toISOString().slice(0,10);
    const isSingleDay = (new Date(start).toISOString().slice(0,10) === todayKey) 
                 && (new Date(end).toISOString().slice(0,10) === todayKey);

let rows = `
<tr>
    <td colspan="2" style="text-align:center; font-weight:700; background:#f7f7f7;">作业内容</td>
</tr>`;

    // === 改造点 3：按 SUBJECT_ORDER 排序 ===
    // 1. 复制 SUBJECT_ORDER 常量
    const SUBJECT_ORDER = [
        '语文','数学','英语','物理','化学',
        '道法','历史','生物','地理','科学','其他'
    ];

    // 2. 对科目进行排序
    const orderedSubjects = Object.entries(grouped).sort(([aName], [bName]) => {
        const idxA = SUBJECT_ORDER.indexOf(aName);
        const idxB = SUBJECT_ORDER.indexOf(bName);
        return (idxA === -1 ? SUBJECT_ORDER.length : idxA) -
               (idxB === -1 ? SUBJECT_ORDER.length : idxB);
    });

    // 3. 遍历排序后的列表 (orderedSubjects)
    orderedSubjects.forEach(([subj, dateMap]) => {
     // 科目行：实心圆点 ●
    rows += `<tr class="subj-row">
        <td colspan="2" style="text-align:left; font-weight:700; background:#f7f7f7;">
            <span style="margin-right:6px;">●</span>${subj}
        </td>
    </tr>`;

    if (isSingleDay) {
    // 不分日期，直接列出任务
    Object.values(dateMap).forEach(tasks => { // 'tasks' 是 [hw, hw]
        tasks.sort((a, b) => (a.task_order || 0) - (b.task_order || 0)); // <-- 修复：添加排序
        tasks.forEach(taskObj => { // <-- 修复：迭代对象
            rows += `<tr>
                <td>&nbsp;</td>
                <td>${taskObj.task}</td>
            </tr>`;
        });
    });
} else {
        // 日期分组
        Object.keys(dateMap).sort((a,b) => new Date(a) - new Date(b)).forEach(dateKey => {
    // 日期行整行显示，不再分两列
    rows += `<tr class="date-row">
        <td colspan="2" style="font-weight:600; color:#333; background:#f9f9f9; text-indent:2em;">${dateKey}</td>
    </tr>`;
    dateMap[dateKey].sort((a, b) => (a.task_order || 0) - (b.task_order || 0)); // <-- 修复：添加排序
    dateMap[dateKey].forEach(taskObj => { // <-- 修复：迭代对象
    // 任务行保持原样，两列结构
    rows += `<tr>
        <td>&nbsp;</td>
        <td>${taskObj.task}</td>
    </tr>`;
    });
});

    }
});

    const content = `
        <html><head>
        <style>
            @page { size: A4; margin: 10mm; }
            body { font-family: 'Segoe UI', sans-serif; margin: 20px; }
            h3 { margin-bottom: 10px; font-size: 18px; font-weight: 700; text-align: center; }
            .meta { text-align: center; margin-bottom: 12px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 15px; table-layout: fixed; }
            colgroup col:first-child { width: 10%; }
            colgroup col:last-child { width: 90%; }
            td { border: 0.6pt solid #cfcfcf; padding: 6px 8px; vertical-align: top; word-wrap: break-word; }
            tbody tr:nth-child(even) td { background: #fbfbfb; }
            .print-time { text-align: right; margin-top: 10px; font-size: 14px; }
        </style>
        </head>
        <body>
        <h3  style="margin-bottom: 16px;">${student.name}（${student.grade}）家庭作业清单</h3>
        <div class="meta" style="text-align: left; font-weight:700; margin-top: 12px;font-size: 15px;">作业日期：${rangeLabel}</div>
        <table>
            <colgroup>
                <col />
                <col />
            </colgroup>
            <tbody>${rows}</tbody>
        </table>
        <div class="print-time">打印时间：${getBeijingDateString()}</div>
        </body>
        </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(content); doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    setTimeout(() => document.body.removeChild(iframe), 1000);
    },

    handleExport() {
        let start = (this.filterStartDate && this.filterStartDate.value) || '';
        let end = (this.filterEndDate && this.filterEndDate.value) || '';
        const today = getBeijingDateString();
        if (!start && !end) { start = end = today; }
        if (start && !end) end = start;
        if (end && !start) start = end;

        // === 改造：在读取时过滤已删除 ===
        const list = App.state.homeworks.filter(h => !h.is_deleted && h.date >= start && h.date <= end);
        if (list.length === 0) { UIModule.showToast('所选范围无作业可导出', 'info'); return; }

        const data = list.map(hw => ({
            // === 改造：在读取时过滤已删除 ===
            姓名: (App.state.students.filter(s => !s.is_deleted).find(s => s.id === hw.studentId) || {}).name,
            年级: (App.state.students.filter(s => !s.is_deleted).find(s => s.id === hw.studentId) || {}).grade,
            科目: (App.state.subjects.filter(s => !s.is_deleted).find(s => s.id === hw.subjectId) || {}).name,
            作业任务: hw.task,
            完成状态: hw.status,
            日期: hw.date
        }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        const fileLabel = start === end ? start : `${start}_to_${end}`;
        XLSX.utils.book_append_sheet(workbook, worksheet, `${fileLabel}作业清单`);
        XLSX.writeFile(workbook, `${fileLabel}家庭作业清单.xlsx`);
        UIModule.showToast('导出成功', 'success');
    }

};


            // =================================================================================
            // CONTRACT MODULE (*** NEW ***)
            // =================================================================================
            const ContractModule = {
                // 模态框
                modal: null,
                holidayModal: null,
                expiringOverlayModal: null, // <--- 在此添加这一行

                // 登记表单
                addForm: document.getElementById('addContractForm'),
                studentSelect: document.getElementById('contractStudentSelect'),
                startDateInput: document.getElementById('contractStartDate'),
                endDateInput: document.getElementById('contractEndDate'),
                
                // 列表
                tableBody: document.getElementById('contractTableBody'),
                
                // 筛选
                filterNameSelect: document.getElementById('filterContractByName'),
                filterStatusSelect: document.getElementById('filterContractByStatus'),
                
                // 按钮
                exportBtn: document.getElementById('exportContractBtn'),
                openHolidayModalBtn: document.getElementById('openHolidayModalBtn'),
                saveHolidayConfigBtn: document.getElementById('saveHolidayConfigBtn'),

                // 节假日模态框内的输入框
                holidayDatesInput: document.getElementById('holidayDates'),
                workdayDatesInput: document.getElementById('workdayDates'),

                // === (新) 合约模块的独立状态 ===
                state: {
                    contracts: [],
                    holidayConfig: { holidays: [], workdays: [], workingDays: 22 } // 新增 workingDays
                },

                // === (新) loadState 和 saveState 方法 ===
                async loadState() {
                    try {
                        const savedState = await IDBModule.getState(IDBModule.STORES.CONTRACT);
                        if (savedState) {
                            this.state = savedState;
                            // (向后兼容，确保 holidayConfig 存在)
                            if (!this.state.holidayConfig) {
    this.state.holidayConfig = { holidays: [], workdays: [], workingDays: 22 };
  } else {
    if (typeof this.state.holidayConfig.workingDays !== 'number') {
      this.state.holidayConfig.workingDays = 22;
    }
  }
}
                    } catch (error) {
                        console.error("Failed to load state from IndexedDB (contractState)", error);
                        this.state = { contracts: [], holidayConfig: { holidays: [], workdays: [] } };
                    }
                },

                async saveState() {
                    try {
                        await IDBModule.saveState(IDBModule.STORES.CONTRACT, this.state);
                        // 新增：跨窗口广播，合约模块也触发同步
                        channel.postMessage({ type: 'STATE_UPDATED' });
                        SupabaseSyncModule.triggerSync();
                    } catch (error) {
                        console.error("Failed to save state to IndexedDB (contractState)", error);
                    }
                },

                async init() {
                    // === MODIFIED: 在 init 中加载自己的状态 ===
                    await this.loadState();
                    // === MODIFICATION END ===
                    this.modal = new bootstrap.Modal(document.getElementById('contractManagementModal'));
                    this.holidayModal = new bootstrap.Modal(document.getElementById('holidayManagementModal'));

                    // === 修改开始：添加 contractOverlapModal 的初始化 ，OverlapModal结束显示expiringOverlayModal===
const expiringModalEl = document.getElementById('expiringOverlayModal');
if (expiringModalEl) {
    this.expiringOverlayModal = new bootstrap.Modal(expiringModalEl);
}

const overlapModalEl = document.getElementById('contractOverlapModal');
if (overlapModalEl) {
    this.overlapModal = new bootstrap.Modal(overlapModalEl);
    
    // 关键逻辑：当重叠警告关闭时，自动触发过期提醒
    overlapModalEl.addEventListener('hidden.bs.modal', () => {
        // 只有当 合约管理主窗口 仍然开着的时候，才继续弹出过期提醒
        // 避免用户关闭了主窗口后还在弹窗
        const mainModal = document.getElementById('contractManagementModal');
        if (mainModal && mainModal.classList.contains('show')) {
            this.checkExpiringContracts();
        }
    });
}
// === 修改结束 ===

                    // === 修改：监听提醒弹窗内部操作，但保留弹窗不关闭 ===
const overlayBody = document.getElementById('expiringOverlayBody');
if (overlayBody) {
    // 移除旧的监听器（如果有的话，防止重复绑定）
    const newOverlayBody = overlayBody.cloneNode(true);
    overlayBody.parentNode.replaceChild(newOverlayBody, overlayBody);

    newOverlayBody.addEventListener('click', (e) => {
        // 查找是否点击了带有 data-action 的元素
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = target.dataset.id;
        
        // 从当前状态中查找合约
        const contract = this.state.contracts.find(c => c.id === id);
        if (!contract) return;

        if (action === 'renew') {
            // 保持提醒遮罩打开，直接叠加显示续约弹窗
            this.handleRenew(contract);
        } else if (action === 'terminate') {
            // 保持提醒遮罩打开，直接叠加显示终止确认框
            this.handleTerminate(contract);
        }
    });
}
// === 修改结束 ===

                    // 绑定事件
                    this.addForm.addEventListener('submit', this.handleAdd.bind(this));
                    this.startDateInput.addEventListener('change', this.handleStartDateChange.bind(this));
                    this.openHolidayModalBtn.addEventListener('click', this.handleOpenHolidayModal.bind(this));
                    this.saveHolidayConfigBtn.addEventListener('click', this.handleSaveHolidayConfig.bind(this));

                    this.filterNameSelect.addEventListener('change', this.renderTable.bind(this));
                    this.filterStatusSelect.addEventListener('change', this.renderTable.bind(this));
                    this.exportBtn.addEventListener('click', this.handleExport.bind(this));

                    this.tableBody.addEventListener('click', this.handleActionClick.bind(this));

                    // === 新增：服务类型图标容器监听 ===
    const svcIcons = document.getElementById('contractServiceTypeIcons');
    const svcError = document.getElementById('contractServiceTypeError');
    if (svcIcons) {
        svcIcons.addEventListener('click', (e) => {
            const icon = e.target.closest('.service-type-icon');
            if (!icon) return;

            // 单选效果：清除所有，再给当前点击的加上 selected
            svcIcons.querySelectorAll('.service-type-icon')
                .forEach(el => el.classList.remove('selected'));
            icon.classList.add('selected');

            // 选择后隐藏错误提示
            if (svcError) svcError.classList.add('d-none');
        });
    }

                    // 初始化日期
                    try {
    this.startDateInput.value = getBeijingDateString();

    // 初始化工作日输入
    const wdInput = document.getElementById('contractWorkingDays');
    if (wdInput) {
      wdInput.value = this.getWorkingDays(); // 默认填入
      wdInput.addEventListener('input', () => {
  const val = parseInt(wdInput.value, 10);
  if (!isNaN(val) && val > 0 && val <= 999) {
    this.state.holidayConfig.workingDays = val;
    this.handleStartDateChange(); // 根据开始日期刷新结束日期
  }
});
    }

    this.handleStartDateChange();
  } catch (e) {
    console.error("Set contract start date failed", e);
  }

                    // === 新增：确保首次渲染使用已加载的 contractState ===
try {
    this.renderStudentSelectors();
    this.renderTable();
} catch (e) {
    console.error('Initial contract render failed:', e);
}

// === 修改开始：调整主窗口打开时的触发逻辑为先检查日期重叠 ===
const mainModalEl = document.getElementById('contractManagementModal');
if (mainModalEl) {
    mainModalEl.addEventListener('shown.bs.modal', () => {
        // 打开时，不再直接查过期，而是先查重叠
        // checkOverlaps 会决定是显示重叠警告，还是直接去 checkExpiringContracts
        this.checkOverlaps(); 
    });
}

    this.endDateInput.addEventListener('change', this.handleEndDateChange.bind(this));

                },



                // === 日期计算核心 ===
                isWeekend(date) {
                    const day = date.getDay();
                    return day === 0 || day === 6; // 0=周日, 6=周六
                },

                getWorkingDays() {
  const wd = this.state?.holidayConfig?.workingDays;
  return (typeof wd === 'number' && wd > 0) ? wd : 22;
},

                // === (重要) 修复 isWorkingDay 以使用 ContractModule.state ===
                isWorkingDay(date) {
                    const dateStr = this.formatDate(date);
                    // === MODIFIED: 引用 this.state ===
                    const config = this.state.holidayConfig;
                    // === MODIFICATION END ===
                    
                    if (config.workdays.includes(dateStr)) {
                        return true;
                    }
                    if (config.holidays.includes(dateStr)) {
                        return false;
                    }
                    if (this.isWeekend(date)) {
                        return false;
                    }
                    return true;
                },

                /**
                 * 计算从 startDateStr 开始算起的第 n 个工作日是哪一天。
                 * 逻辑：先检查起始日是否为工作日，然后从第二天开始，逐日推进，直到达到 n 天。
                 */
                calculateNthWorkingDay(startDateStr, n) {
                    let currentDate = new Date(startDateStr + 'T00:00:00'); // 确保使用当地日期午夜开始计算
                    let workingDayCount = 0;

                    if (n <= 0) return currentDate;

                    // 1. 检查起始日是否是工作日，如果是，则计为第1天
                    if (this.isWorkingDay(currentDate)) {
                        workingDayCount = 1;
                    }
                    
                    // 如果 n=1 且起始日是工作日，则直接返回
                    if (workingDayCount === n) {
                        return currentDate;
                    }

                    // 2. 循环直到达到 n 个工作日
                    while (workingDayCount < n) {
                        // 每次循环，日期必须向前推进1天，这是避免死循环的关键
                        currentDate.setDate(currentDate.getDate() + 1);

                        if (this.isWorkingDay(currentDate)) {
                            workingDayCount++;
                        }
                        
                        // 安全锁：如果超过 5 年仍未找到 (防止极端配置错误)
                        if (currentDate.getFullYear() > new Date(startDateStr + 'T00:00:00').getFullYear() + 5) {
                            console.error("Working day calculation timeout: over 5 years passed.");
                            break; 
                        }
                    }
                    return currentDate;
                },

                formatDate(date) {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                },
                
                // 计算日期相差天数
                calculateDaysRemaining(endDateStr) {
                    if (!endDateStr) return 0;
                    const today = new Date(getBeijingDateString() + 'T00:00:00');
                    const endDate = new Date(endDateStr + 'T00:00:00');
                    const diffTime = endDate.getTime() - today.getTime();
                    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                },

                handleEndDateChangeForModal(type) {
    const startInput = document.getElementById(
        type === 'edit' ? 'editContractStartDate' : 'renewContractStartDate'
    );
    const endInput = document.getElementById(
        type === 'edit' ? 'editContractEndDate' : 'renewContractEndDate'
    );
    const wdInput = document.getElementById(
        type === 'edit' ? 'editContractWorkingDays' : 'renewContractWorkingDays'
    );

    if (!startInput || !endInput || !wdInput) return;

    const startDate = startInput.value;
    const endDate = endInput.value;
    if (!startDate || !endDate) return;

    // ✅ 新增验证逻辑：结束日期不能早于开始日期
    if (new Date(endDate + 'T00:00:00') < new Date(startDate + 'T00:00:00')) {
        UIModule.showToast("结束日期不能早于开始日期", "error", "center");
        endInput.value = ""; // 清空错误输入，避免继续计算
        return;
    }


    try {
        let count = 0;
        let currentDate = new Date(startDate + 'T00:00:00');
        const targetDate = new Date(endDate + 'T00:00:00');
        while (currentDate <= targetDate) {
            if (this.isWorkingDay(currentDate)) count++;
            currentDate.setDate(currentDate.getDate() + 1);
        }
        wdInput.value = count;

        // 同步到 state
        const editingContract = this.currentEditingContract;
        if (editingContract) {
            editingContract.startDate = startDate;
            editingContract.workingDays = count;
            editingContract.endDate = endDate;
            this.saveState();
        }
    } catch (e) {
        console.error("Error calculating working days:", e);
        UIModule.showToast("计算工作日数失败", "error", 'center');
    }
},


                // === 日期区间重叠检测函数 ===
hasDateOverlap(existingContract, newStart, newEnd) {
  const eStart = new Date(existingContract.startDate + 'T00:00:00');
  const eEnd   = new Date(existingContract.endDate + 'T00:00:00');
  const nStart = new Date(newStart + 'T00:00:00');
  const nEnd   = new Date(newEnd + 'T00:00:00');
  return (nStart <= eEnd && nEnd >= eStart);
},


// === 公共函数：检查合约重叠 ===
checkContractOverlap(studentId, startDate, endDate, excludeId = null) {
  // === 改造：在读取时过滤已删除 ===
  return this.state.contracts.filter(c => !c.is_deleted).find(c => {
    if (excludeId && c.id === excludeId) return false; // 排除当前合约
    const status = this.getContractStatus(c).text;
    return c.studentId === studentId &&
      (status === '生效中' || status === '即将过期') &&
      this.hasDateOverlap(c, startDate, endDate);
  }) || null;
},
 

                // === 渲染与表单处理 ===

                renderStudentSelectors() {
                    // === 改造：在读取时过滤已删除 (从 App.state) ===
                    const sortedStudents = App.state.students.filter(s => !s.is_deleted).sort((a, b) => App.grades.indexOf(a.grade) - App.grades.indexOf(b.grade));
                    // === MODIFICATION END ===
                    
                    const createOptions = (defaultLabel) => {
                        return `<option value="">${defaultLabel}</option>` +
                               sortedStudents.map(s => `<option value="${s.id}">${s.name} (${s.grade})</option>`).join('');
                    };
                    
                    this.studentSelect.innerHTML = createOptions('请选择学生...');
                    this.filterNameSelect.innerHTML = createOptions('按姓名筛选');
                },

                handleStartDateChange() {
  const startDate = this.startDateInput.value;
  if (!startDate) return;
  try {
    const wdInput = document.getElementById('contractWorkingDays');
    const workingDays = wdInput ? parseInt(wdInput.value, 10) : this.getWorkingDays();
    const nthDay = this.calculateNthWorkingDay(startDate, this.getWorkingDays()); // 使用自定义工作日
    this.endDateInput.value = this.formatDate(nthDay);

     // 同步到 state
    const editingContract = this.currentEditingContract;
    if (editingContract) {
      editingContract.startDate = startDate;
      editingContract.workingDays = workingDays;
      editingContract.endDate = this.endDateInput.value;
      this.saveState();
    }

  } catch (e) {
    console.error("Error calculating end date:", e);
    UIModule.showToast("计算结束日期失败，请检查节假日设置", "error", 'center');
  }
},

handleEndDateChange() {
  const startDate = this.startDateInput.value;
  const endDate = this.endDateInput.value;
  if (!startDate || !endDate) return;


   // ✅ 新增验证逻辑
  if (new Date(endDate + 'T00:00:00') < new Date(startDate + 'T00:00:00')) {
    UIModule.showToast("结束日期不能早于开始日期", "error", "center");
    this.endDateInput.value = ""; // 清空错误输入
    return;
  }

  try {
    // 计算实际工作日数
    let count = 0;
    let currentDate = new Date(startDate + 'T00:00:00');
    const targetDate = new Date(endDate + 'T00:00:00');
    while (currentDate <= targetDate) {
      if (this.isWorkingDay(currentDate)) count++;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const wdInput = document.getElementById('contractWorkingDays');
    if (wdInput) wdInput.value = count;

    // 同步到 state
    const editingContract = this.currentEditingContract;
    if (editingContract) {
      editingContract.startDate = startDate;
      editingContract.workingDays = count;
      editingContract.endDate = endDate;
      this.saveState();
    }
  } catch (e) {
    console.error("Error calculating working days:", e);
    UIModule.showToast("计算工作日数失败", "error", 'center');
  }
},


                // === 新增：日期区间重叠检测函数 ===
hasDateOverlap(existingContract, newStart, newEnd) {
    const eStart = new Date(existingContract.startDate + 'T00:00:00');
    const eEnd   = new Date(existingContract.endDate + 'T00:00:00');
    const nStart = new Date(newStart + 'T00:00:00');
    const nEnd   = new Date(newEnd + 'T00:00:00');

    // 判断是否有交集：只要新开始 <= 已结束 且 新结束 >= 已开始
    return (nStart <= eEnd && nEnd >= eStart);
},


                // (这是修复后的 handleAdd 函数，请完整替换)
// (这是修复后的 handleAdd 函数，请完整替换)
async handleAdd(e) {
  e.preventDefault();

  // (新) 1. 获取按钮并立即禁用
  // (我们假设按钮 ID 是 'addContractBtn'，如果不是，请修改此 ID)
  const addBtn = document.getElementById('addContractBtn'); 
  if (addBtn && addBtn.disabled) return; // 防止双击
  if (addBtn) addBtn.disabled = true;

  try {
    const studentId = this.studentSelect.value;
    const svcIcons = document.getElementById('contractServiceTypeIcons');
    const svcError = document.getElementById('contractServiceTypeError');
    const selectedIcon = svcIcons ? svcIcons.querySelector('.service-type-icon.selected') : null;
    const serviceType = selectedIcon ? selectedIcon.dataset.serviceType : '';
    const startDate = this.startDateInput.value;
    const endDate = this.endDateInput.value;
    const wdInput = document.getElementById('contractWorkingDays');
    const workingDays = wdInput ? parseInt(wdInput.value, 10) : ContractModule.getWorkingDays();

    // (新) 2. 在所有验证失败的地方，重新启用按钮
    if (!studentId || !serviceType || !startDate || !endDate) {
      if (!serviceType && svcError) svcError.classList.remove('d-none');
      UIModule.showToast('请填写所有必填项', 'error', 'center');
      if (addBtn) addBtn.disabled = false; // 启用
      return;
    }

    if (new Date(endDate + 'T00:00:00') < new Date(startDate + 'T00:00:00')) {
      UIModule.showToast("结束日期不能早于开始日期", "error", "center");
      if (addBtn) addBtn.disabled = false; // 启用
      return;
    }

    const overlapContract = this.checkContractOverlap(studentId, startDate, endDate);
    if (overlapContract) {
      UIModule.showWarningModal(
        '新合约日期重叠',
        `⚠️ 该学生生效中合约（${overlapContract.startDate} 至 ${overlapContract.endDate}）尚未到期，请在 ${overlapContract.endDate} 日之后登记新合约！`
      );
      if (addBtn) addBtn.disabled = false; // 启用
      return;
    }

    const newContract = {
      id: App.generateId(),
      studentId,
      serviceType,
      startDate,
      endDate,
      workingDays,
      status: '生效中',
      is_deleted: false
    };
    this.state.contracts.push(newContract);
    
    // (新) 3. 等待 saveState 完成
    await this.saveState();

    UIModule.showToast('合约登记成功', 'success');
    this.addForm.reset();
    const selected = svcIcons?.querySelector('.service-type-icon.selected');
    if (selected) selected.classList.remove('selected');
    this.startDateInput.value = getBeijingDateString();

    if (wdInput) {
      wdInput.value = 22;
      this.state.holidayConfig.workingDays = 22;
      await this.saveState(); // (新) 再次 await
    }
    this.handleStartDateChange();
    this.renderTable();

  } catch (err) {
    console.error("handleAdd contract failed:", err);
    UIModule.showToast('登记失败，请查看控制台', 'error', 'center');
  } finally {
    // (新) 4. 无论成功或失败，最后都重新启用按钮
    if (addBtn) addBtn.disabled = false;
  }
},

                // === 列表渲染 ===

                getContractStatus(contract) {
                    // 1. 检查是否为用户手动设置的归档状态
    if (contract.status === '已续约') {
        return { text: '已续约', class: 'status-renewed' };
    }
    if (contract.status === '已终止') {
        return { text: '已终止', class: 'status-terminated' };
    }
                    
                    // 2. 计算有效期
                    const daysRemaining = this.calculateDaysRemaining(contract.endDate);
                    
                    if (daysRemaining < 0) {
                        return { text: '已过期', class: 'status-expired' };
                    }
                    if (daysRemaining <= 7) {
                        return { text: '即将过期', class: 'status-warning' };
                    }
                    return { text: '生效中', class: 'status-valid' };
                },

                renderTable() {
                    const nameFilter = this.filterNameSelect.value;
                    const statusFilter = this.filterStatusSelect.value;

                    // === 新增修复点：创建学生 Map 用于高效查找（避免多次遍历） ===
                    // 仅包含未被软删除的学生
                    const activeStudentsMap = new Map(App.state.students
                        .filter(s => !s.is_deleted)
                        .map(s => [s.id, s])
                    );
                    // === 修复点结束 ===

                    // === 改造：在读取时过滤已删除 ===
                    let filteredContracts = this.state.contracts.filter(c => !c.is_deleted);
                    // === MODIFICATION END ===

                    // 1. 计算状态和有效期
                    const processedContracts = filteredContracts.map(c => {
                        // === 修复点：使用 Map 查找学生，查找速度更快，且能处理找不到的情况 ===
                        const student = activeStudentsMap.get(c.studentId);
                        // === 修复点结束 ===
                        
                        const computedStatus = this.getContractStatus(c);

                        // 如果是已续约或已终止，不计算有效期，直接显示 "-"
                        let daysRemaining;
                        if (computedStatus.text === '已续约' || computedStatus.text === '已终止') {
                            daysRemaining = '-';
                        } else {
                            daysRemaining = this.calculateDaysRemaining(c.endDate);
                        }

                        return {
                            ...c,
                            // 如果找不到学生，则标记为 '未知'
                            studentName: student ? student.name : '未知',
                            studentGrade: student ? student.grade : '未知',
                            computedStatus: computedStatus.text,
                            statusClass: computedStatus.class,
                            daysRemaining: daysRemaining,
                            workingDaysDisplay: c.workingDays || this.getWorkingDays()   // ✅ 新增字段
                        };
                    });
                    
                    // === 新增修复点：过滤掉学生标记为 '未知' 的合约，防止显示孤立数据 ===
                    filteredContracts = processedContracts.filter(c => c.studentName !== '未知');
                    // === 修复点结束 ===

                    // 2. 筛选
                    if (nameFilter) {
                        filteredContracts = filteredContracts.filter(c => c.studentId === nameFilter);
                    } else {
                        // 逻辑已在上面的 `filteredContracts = processedContracts.filter(...)` 中处理，此处不再需要 `filteredContracts = processedContracts;`
                    }

                    if (statusFilter) {
                        filteredContracts = filteredContracts.filter(c => c.computedStatus === statusFilter);
                    }

                    // 3. 排序
                    filteredContracts.sort((a, b) => {
                        // 归档状态（已续约, 已终止）排在最后
                        const aArchived = (a.computedStatus === '已续约' || a.computedStatus === '已终止');
                        const bArchived = (b.computedStatus === '已续约' || b.computedStatus === '已终止');

                        if (aArchived && !bArchived) return 1;
                        if (!aArchived && bArchived) return -1;

                        // 如果双方都是归档状态，不再按有效期比较（避免 "-" 参与数值计算）
                        if (aArchived && bArchived) return 0;
                        
                        // 按有效期（天数）升序
                        return a.daysRemaining - b.daysRemaining;
                    });

                    // 4. 生成 HTML
                    if (filteredContracts.length === 0) {
                        this.tableBody.innerHTML = `<tr><td colspan="9" class="text-center">暂无合约信息</td></tr>`;
                        return;
                    }

                    this.tableBody.innerHTML = filteredContracts.map((c, index) => {
                        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${c.studentName}</td>
                                <td>${c.studentGrade}</td>
                                <td>${c.serviceType}</td>
                                <td>${c.startDate}</td>
                                <td>${c.workingDaysDisplay} 天</td>
                                <td>${c.endDate}</td>
                                <td>${c.daysRemaining} 天</td>
                                <td class="status-cell"><span class="${c.statusClass}">${c.computedStatus}</span></td>
                                <td>${this.renderActions(c)}</td>
                            </tr>
                        `;
                    }).join('');
                },

                // 在 ContractModule 内部替换 renderActions 函数，为已过期增加删除选项，为已续约/已终止增加删除选项
renderActions(contract) {
    const status = contract.computedStatus;
    const id = contract.id;
    let actions = '';

    if (status === '生效中' || status === '即将过期') {
        actions = `
            <i class="fas fa-print" data-id="${id}" data-action="print" title="打印"></i>
            <i class="fas fa-edit" data-id="${id}" data-action="edit" title="编辑"></i>
            <i class="fas fa-sync-alt" data-id="${id}" data-action="renew" title="续约"></i>
            <i class="fas fa-ban" data-id="${id}" data-action="terminate" title="终止"></i>
            <i class="fas fa-trash-alt" data-id="${id}" data-action="delete" title="删除"></i>
        `;
    } else if (status === '已过期') {
        actions = `
            <i class="fas fa-print" data-id="${id}" data-action="print" title="打印"></i>
            <i class="fas fa-edit" data-id="${id}" data-action="edit" title="编辑"></i>
            <i class="fas fa-sync-alt" data-id="${id}" data-action="renew" title="续约"></i>
            <i class="fas fa-ban" data-id="${id}" data-action="terminate" title="终止"></i>
            <i class="fas fa-trash-alt" data-id="${id}" data-action="delete" title="删除"></i>
        `;
    } else {
        // 已续约 / 已终止 -> 现在允许删除
        actions = `
            <i class="fas fa-edit" data-id="${id}" data-action="edit" title="编辑"></i>
            <i class="fas fa-trash-alt" data-id="${id}" data-action="delete" title="删除"></i>
        `;
    }
    return `<div class="action-icons">${actions}</div>`;
},
                
                // 公共函数：根据开始日期计算结束日期（22 个工作日）
                calculateContractEndDate(startDate) {
                // 调用已有的工作日计算函数
                return this.calculateNthWorkingDay(startDate, this.getWorkingDays());
                },


                // === 列表操作 ===
                handleActionClick(e) {
                    const target = e.target.closest('[data-action]');
                    if (!target) return;

                    const id = target.dataset.id;
                    const action = target.dataset.action;
                    // === MODIFIED: 从 this.state 查找 ===
                    const contract = this.state.contracts.find(c => c.id === id && !c.is_deleted);
                    // === MODIFICATION END ===
                    if (!contract) return;

                    switch (action) {
                        case 'edit':
                            this.handleEdit(contract);
                            break;
                        case 'renew':
                            this.handleRenew(contract);
                            break;
                        case 'terminate':
                            this.handleTerminate(contract);
                            break;
                        case 'delete':
                            this.handleDelete(contract);
                            break;
                        case 'print':
                            this.handlePrint(contract);
                            break;
                    }
                },

                handlePrint(contract) {
    const student = App.state.students.filter(s => !s.is_deleted).find(s => s.id === contract.studentId);
    // 动态工作日数：优先取合约对象里的 workingDays，没有则取当前配置
    const workingDays = contract.workingDays || ContractModule.getWorkingDays();
    const formHTML = `
        <div class="contract-detail">
            <h5 class="text-center">托管服务收费单</h5>
            <p>学生姓名：${student ? student.name : '未知'} (${student ? student.grade : '未知'})</p>
            <p>服务类型：${contract.serviceType}</p>
            <p>起止日期：${contract.startDate} 至 ${contract.endDate}&nbsp;共计 ${workingDays} 个工作日</p>
            <hr>
            <table class="table table-bordered" style="width:100%; text-align:center;">
                <thead>
                    <tr style="background:#f0f0f0; font-weight:bold;">
                        <th style="width:30%;">项目</th>
                        <th style="width:20%;">金额</th>
                        <th style="width:50%;">说明</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>预收托管费</td>
                        <td><input type="number" step="0.01" class="form-control fee-input" id="feeTuoguan"></td>
                        <td><input type="text" class="form-control" disabled value="${contract.startDate} 至 ${contract.endDate}"></td>
                    </tr>
                    <tr>
                        <td>资料打印费</td>
                        <td><input type="number" step="0.01" class="form-control fee-input" id="feePrint"></td>
                        <td><input type="text" class="form-control" disabled value="A4，0.5元/页"></td>
                    </tr>
                    <tr>
                        <td>文具费</td>
                        <td><input type="number" step="0.01" class="form-control fee-input" id="feeStationery"></td>
                        <td><input type="text" class="form-control" disabled value="作业本、笔、修正带、套尺等"></td>
                    </tr>
                    <tr>
                        <td>其他费用</td>
                        <td><input type="number" step="0.01" class="form-control fee-input" id="feeOther"></td>
                        <td><input type="text" class="form-control" id="feeOtherDesc" maxlength="100" placeholder="说明(最多100字)"></td>
                    </tr>
                    <tr>
                        <td>退费</td>
                        <td><input type="number" step="0.01" class="form-control fee-input" id="feeRefund"></td>
                        <td><input type="text" class="form-control" id="feeRefundDesc" maxlength="100" placeholder="说明(最多100字)"></td>
                    </tr>
                    <tr style="font-weight:bold;">
                        <td>合计费用</td>
                        <td colspan="2"><span id="feeTotal">0.00</span> 元</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    // 修复按钮文字：明确传入“打印”和“取消”
    UIModule.showEditModal(
        '托管服务收费单',
        formHTML,
        () => {
            this.printReceipt(contract);
            return true;
        },
        '打印',
        '取消'
    );

    // 实时更新合计费用
    const inputs = document.querySelectorAll('.fee-input');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const tuoguan = parseFloat(document.getElementById('feeTuoguan').value) || 0;
            const print = parseFloat(document.getElementById('feePrint').value) || 0;
            const stationery = parseFloat(document.getElementById('feeStationery').value) || 0;
            const other = parseFloat(document.getElementById('feeOther').value) || 0;
            const refund = parseFloat(document.getElementById('feeRefund').value) || 0;
            const total = (tuoguan + print + stationery + other - refund).toFixed(2);
            document.getElementById('feeTotal').textContent = total;
        });
    });
},

printReceipt(contract) {
    const student = App.state.students.filter(s => !s.is_deleted).find(s => s.id === contract.studentId);

    // 获取输入值
    const items = [
        { name: '预收托管费', amount: parseFloat(document.getElementById('feeTuoguan').value) || 0, desc: `${contract.startDate} 至 ${contract.endDate}`},
        { name: '资料打印费', amount: parseFloat(document.getElementById('feePrint').value) || 0, desc: 'A4，0.5元/页' },
        { name: '文具费', amount: parseFloat(document.getElementById('feeStationery').value) || 0, desc: '作业本、笔、修正带、套尺等' },
        { name: '其他收费', amount: parseFloat(document.getElementById('feeOther').value) || 0, desc: document.getElementById('feeOtherDesc').value || '—' },
        { name: '退费', amount: parseFloat(document.getElementById('feeRefund').value) || 0, desc: document.getElementById('feeRefundDesc').value || '—' }
    ];

    const total = document.getElementById('feeTotal').textContent;

    // 过滤掉金额为0的行
    const rowsHTML = items
        .filter(item => item.amount !== 0)
        .map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.amount.toFixed(2)} 元</td>
                <td>${item.desc}</td>
            </tr>
        `).join('');

    // 判断退费金额是否大于0
    const refundItem = items.find(i => i.name === '退费');
    const refundNote = (refundItem && refundItem.amount > 0)
        ? `<p style="margin-top:15px; font-size:0.9rem; color:#d83b01; font-style:italic;">
             *因学校组织活动放假，放假期间费用退还。<br>
             *因个人原因请假三天以上，请假期间费用退还。
           </p>`
        : '';

    // 动态工作日数
    const workingDays = contract.workingDays || ContractModule.getWorkingDays();

    const receiptHTML = `
    <html>
      <head><title>打印收费单</title></head>
      <body style="font-family: SimSun; padding:20px; line-height:1.6;">
        <h2 style="text-align:center; border-bottom:2px solid #000; padding-bottom:5px;">托管服务收费单</h2>
        <p>学生姓名：${student ? student.name : '未知'} (${student ? student.grade : '未知'})</p>
        <p>服务类型：${contract.serviceType}</p>
        <p>起止日期：${contract.startDate} 至 ${contract.endDate}&nbsp;（${workingDays} 个工作日。法定节假日期间结束日期顺延）</p>
        <hr>
        <table style="width:100%; border-collapse:collapse; text-align:center;" border="1">
          <tr style="background:#f0f0f0; font-weight:bold;">
            <th style="width:30%;">项目</th>
            <th style="width:20%;">金额</th>
            <th style="width:50%;">说明</th>
          </tr>
          ${rowsHTML}
          <tr style="font-weight:bold; background:#fafafa;">
            <td>合计费用</td>
            <td colspan="2"><strong>${total} 元</strong></td>
          </tr>
        </table>
        ${refundNote}
        <p style="text-align:right; margin-top:30px;">打印日期：${getBeijingDateString()}</p>
      </body>
    </html>
    `;

    // 创建隐藏 iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(receiptHTML);
    doc.close();

    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    // 打印结束后移除 iframe
    setTimeout(() => document.body.removeChild(iframe), 1000);
},

// (新) 辅助函数：查找学生最近的一份“已续约”合同
                _findMostRecentRenewedContract(studentId, excludeContractId) {
                    const renewedContracts = this.state.contracts.filter(c => 
                        !c.is_deleted &&
                        c.studentId === studentId &&
                        c.status === '已续约' &&
                        c.id !== excludeContractId
                    ); //

                    if (renewedContracts.length === 0) {
                        return null;
                    }

                    // 按结束日期降序排序
                    renewedContracts.sort((a, b) => b.endDate.localeCompare(a.endDate));
                    
                    return renewedContracts[0]; // 返回最近的一份
                },


                handleEdit(contract) {
  const formHTML = `
    <div class="mb-3">
      <label for="editServiceType" class="form-label">服务类型*</label>
      <select class="form-select" id="editServiceType">
        <option value="午托" ${contract.serviceType === '午托' ? 'selected' : ''}>午托</option>
        <option value="晚托" ${contract.serviceType === '晚托' ? 'selected' : ''}>晚托</option>
        <option value="全托" ${contract.serviceType === '全托' ? 'selected' : ''}>全托</option>
        <option value="临时托管" ${contract.serviceType === '临时托管' ? 'selected' : ''}>临时托管</option>
      </select>
    </div>
    <div class="mb-3">
      <label for="editStartDate" class="form-label">开始日期*</label>
      <input type="date" class="form-control" id="editStartDate" value="${contract.startDate}" required>
    </div>
    <div class="mb-3">
      <label for="editWorkingDays" class="form-label">工作日天数</label>
      <input type="number" class="form-control" id="editWorkingDays" min="1" max="999" step="1"
             value="${contract.workingDays || this.getWorkingDays()}" required>
    </div>
    <div class="mb-3">
      <label for="editEndDate" class="form-label">结束日期*</label>
      <input type="date" class="form-control" id="editEndDate" value="${contract.endDate}" required>
    </div>`;

  UIModule.showEditModal('编辑合约', formHTML, () => {
    const start = document.getElementById('editStartDate').value;
    const end = document.getElementById('editEndDate').value;
    const wdVal = document.getElementById('editWorkingDays').value;

    // ✅ 修复：使用正确的变量 start / end (原有逻辑)
    if (new Date(end + 'T00:00:00') < new Date(start + 'T00:00:00')) {
      UIModule.showWarningModal(
        '日期错误',
        `⚠️ 结束日期 (${end}) 不能早于开始日期 (${start})，请重新选择！`
      ); //
      return false; // 阻止保存
    }

    if (!start || !end || !wdVal) {
      UIModule.showToast('开始日期、工作日天数、结束日期均为必填项', 'error', 'center'); //
      return false;
    }

    // --- (新) 逻辑：检查是否早于最近的“已续约”合同 ---
    // (在保存时再次校验)
    const mostRecentRenewed = this._findMostRecentRenewedContract(contract.studentId, contract.id);
    if (mostRecentRenewed) {
        const renewedEndDate = mostRecentRenewed.endDate;
        if (new Date(start + 'T00:00:00') <= new Date(renewedEndDate + 'T00:00:00')) {
            UIModule.showWarningModal(
                '日期冲突',
                `⚠️ 新的开始日期 (${start}) 不能早于或等于最近一期已续约合约的结束日期 (${renewedEndDate})。`
            ); //
            return false; // 阻止保存
        }
    }
    // --- (新) 逻辑结束 ---

    // === 重叠校验 (原有逻辑) ===
    const overlapContract = this.checkContractOverlap(contract.studentId, start, end, contract.id); //
    if (overlapContract) {
      UIModule.showWarningModal(
        '合约起止日期重叠',
        `⚠️ 该学生生效中合约（${overlapContract.startDate} 至 ${overlapContract.endDate}）尚未到期，请重新输入起止日期后再次提交！`
      ); //
      return false;
    }

    contract.serviceType = document.getElementById('editServiceType').value;
    contract.startDate = start;
    contract.endDate = end;
    contract.workingDays = parseInt(wdVal, 10) || this.getWorkingDays(); //

    this.saveState(); //
    this.renderTable(); //
    UIModule.showToast('合约已更新', 'success'); //
    return true;
  });

  // === 联动逻辑 ===
  const editStartInput = document.getElementById('editStartDate');
  const editEndInput = document.getElementById('editEndDate');
  const editWdInput = document.getElementById('editWorkingDays');

  if (editStartInput && editEndInput && editWdInput) {
    
    // (新) 在闭包中查找一次，供实时校验复用
    const mostRecentRenewed = this._findMostRecentRenewedContract(contract.studentId, contract.id);

    const recalcEndDate = () => {
      const s = editStartInput.value;
      const wd = parseInt(editWdInput.value, 10) || this.getWorkingDays(); //
      if (!s) return;

      // --- (新) 逻辑：实时检查是否早于“已续约”合同 ---
      if (mostRecentRenewed) {
          const renewedEndDate = mostRecentRenewed.endDate;
          if (new Date(s + 'T00:00:00') <= new Date(renewedEndDate + 'T00:00:00')) {
              UIModule.showWarningModal(
                  '日期冲突',
                  `⚠️ 新的开始日期 (${s}) 不能早于或等于最近一份已续约合同的结束日期 (${renewedEndDate})。`
              ); //
              // 将日期重置回原来的值
              editStartInput.value = contract.startDate;
              return; // 阻止后续的结束日期计算
          }
      }
      // --- (新) 逻辑结束 ---

      try {
        const nthDay = this.calculateNthWorkingDay(s, wd); //
        editEndInput.value = this.formatDate(nthDay); //
      } catch (e) {
        console.error('Edit modal end date auto-calc failed:', e);
        UIModule.showToast('计算结束日期失败，请检查节假日设置', 'error', 'center'); //
      }
    };

    const recalcWorkingDays = () => {
      const s = editStartInput.value;
      const e = editEndInput.value;
      if (!s || !e) return;
      try {
        let count = 0;
        let currentDate = new Date(s + 'T00:00:00');
        const targetDate = new Date(e + 'T00:00:00');
        while (currentDate <= targetDate) {
          if (this.isWorkingDay(currentDate)) count++; //
          currentDate.setDate(currentDate.getDate() + 1);
        }
        editWdInput.value = count;
      } catch (err) {
        console.error('Edit modal working days auto-calc failed:', err);
      }
    };

    editStartInput.addEventListener('change', recalcEndDate);
    editWdInput.addEventListener('input', recalcEndDate);
    editEndInput.addEventListener('change', () => {
      const s = editStartInput.value;
      const e = editEndInput.value;
      if (s && e && new Date(e + 'T00:00:00') < new Date(s + 'T00:00:00')) {
        UIModule.showWarningModal(
          '日期错误',
          `⚠️ 结束日期 (${e}) 不能早于开始日期 (${s})，请重新选择！`
        ); //
        editEndInput.value = ""; // 清空错误输入
        return;
      }
      recalcWorkingDays();
    });
  }
},



                
                handleRenew(contract) {
  // 默认新开始日期为旧结束日期 +1 天
  const oldEndDate = new Date(contract.endDate + 'T00:00:00');
  oldEndDate.setDate(oldEndDate.getDate() + 1);
  const newStartDate = this.formatDate(oldEndDate);

  // 默认新结束日期：按工作日数计算
  const wdDefault = contract.workingDays || this.getWorkingDays();
  const newEndDate = this.formatDate(this.calculateNthWorkingDay(newStartDate, wdDefault));

  const formHTML = `
    <div class="alert alert-info">
      正在为【${this.studentSelect.querySelector(`option[value="${contract.studentId}"]`).textContent}】的合约（${contract.endDate} 到期）进行续约。
    </div>
    <div class="mb-3">
      <label for="renewServiceType" class="form-label">服务类型*</label>
      <select class="form-select" id="renewServiceType">
        <option value="午托" ${contract.serviceType === '午托' ? 'selected' : ''}>午托</option>
        <option value="晚托" ${contract.serviceType === '晚托' ? 'selected' : ''}>晚托</option>
        <option value="全托" ${contract.serviceType === '全托' ? 'selected' : ''}>全托</option>
        <option value="临时托管" ${contract.serviceType === '临时托管' ? 'selected' : ''}>临时托管</option>
      </select>
    </div>
    <div class="mb-3">
      <label for="renewStartDate" class="form-label">新合约开始日期*</label>
      <input type="date" class="form-control" id="renewStartDate" value="${newStartDate}" required>
    </div>
    <div class="mb-3">
      <label for="renewWorkingDays" class="form-label">工作日天数</label>
      <input type="number" class="form-control" id="renewWorkingDays" min="1" max="999" step="1"
             value="${wdDefault}" required>
    </div>
    <div class="mb-3">
      <label for="renewEndDate" class="form-label">新合约结束日期*</label>
      <input type="date" class="form-control" id="renewEndDate" value="${newEndDate}" required>
    </div>`;

  UIModule.showEditModal('合约续约', formHTML, () => {
    const newStart = document.getElementById('renewStartDate').value;
    const newEnd = document.getElementById('renewEndDate').value;
    const wdVal = document.getElementById('renewWorkingDays').value;

    // ✅ 校验：结束日期不能早于开始日期
    if (new Date(newEnd + 'T00:00:00') < new Date(newStart + 'T00:00:00')) {
      UIModule.showWarningModal(
        '日期错误',
        `⚠️ 续约结束日期 (${newEnd}) 不能早于续约开始日期 (${newStart})，请重新选择！`
      );
      return false;
    }

    if (!newStart || !newEnd || !wdVal) {
      UIModule.showToast('新合约开始日期、工作日天数、结束日期均为必填项', 'error', 'center');
      return false;
    }

    const wd = parseInt(wdVal, 10) || this.getWorkingDays();

    // 限制逻辑：新开始日期必须晚于旧结束日期
    const oldEnd = new Date(contract.endDate + 'T00:00:00');
    const newStartDateObj = new Date(newStart + 'T00:00:00');
    if (newStartDateObj <= oldEnd) {
      UIModule.showToast('新合约开始日期必须晚于当前合约的结束日期', 'error', 'center');
      return false;
    }

    // === 重叠校验 ===
    const overlapContract = this.checkContractOverlap(contract.studentId, newStart, newEnd, contract.id);
    if (overlapContract) {
      UIModule.showWarningModal(
        '续约日期重叠',
        `⚠️ 该学生生效中合约（${overlapContract.startDate} 至 ${overlapContract.endDate}）尚未到期，请重新输入起止日期后再次提交！`
      );
      return false;
    }


    const newContract = {
      id: App.generateId(),
      studentId: contract.studentId,
      serviceType: document.getElementById('renewServiceType').value,
      startDate: newStart,
      endDate: newEnd,
      workingDays: wd,
      status: '生效中',
      is_deleted: false // <-- 修复：补充此行
    };
    
    // 原合约标记为已续约
    contract.status = '已续约';
    this.state.contracts.push(newContract);
    this.saveState();
    this.renderTable();
    // (新) 如果到期提醒窗口是打开的，立即刷新它（该条目会自动消失）
    if (document.getElementById('expiringOverlayModal').classList.contains('show')) {
        this.checkExpiringContracts();
    }
    UIModule.showToast('续约成功，已生成新合约', 'success', 'center');
    return true;
  });

  // === 联动逻辑 ===
  setTimeout(() => {
    const renewStartInput = document.getElementById('renewStartDate');
    const renewEndInput = document.getElementById('renewEndDate');
    const renewWdInput = document.getElementById('renewWorkingDays');

    if (renewStartInput && renewEndInput && renewWdInput) {
      const recalcEndDate = () => {
        const s = renewStartInput.value;
        const wd = parseInt(renewWdInput.value, 10) || this.getWorkingDays();
        if (!s) return;

        const oldEnd = new Date(contract.endDate + 'T00:00:00');
        const newStartDateObj = new Date(s + 'T00:00:00');
        if (newStartDateObj <= oldEnd) {
          UIModule.showToast('新合约开始日期必须晚于当前合约的结束日期', 'error', 'center');
          const corrected = new Date(contract.endDate + 'T00:00:00');
          corrected.setDate(corrected.getDate() + 1);
          renewStartInput.value = this.formatDate(corrected);
          return;
        }

        try {
          const nthDay = this.calculateNthWorkingDay(s, wd);
          renewEndInput.value = this.formatDate(nthDay);
        } catch (e) {
          console.error('Renew modal end date auto-calc failed:', e);
          UIModule.showToast('计算结束日期失败，请检查节假日设置', 'error', 'center');
        }
      };

      const recalcWorkingDays = () => {
        const s = renewStartInput.value;
        const e = renewEndInput.value;
        if (!s || !e) return;
        try {
          let count = 0;
          let currentDate = new Date(s + 'T00:00:00');
          const targetDate = new Date(e + 'T00:00:00');
          while (currentDate <= targetDate) {
            if (this.isWorkingDay(currentDate)) count++;
            currentDate.setDate(currentDate.getDate() + 1);
          }
          renewWdInput.value = count;
        } catch (err) {
          console.error('Renew modal working days auto-calc failed:', err);
        }
      };

      renewStartInput.addEventListener('change', recalcEndDate);
      renewWdInput.addEventListener('input', recalcEndDate);
      renewEndInput.addEventListener('change', () => {
  const s = renewStartInput.value;
  const e = renewEndInput.value;
  if (s && e && new Date(e + 'T00:00:00') < new Date(s + 'T00:00:00')) {
    UIModule.showWarningModal(
      '日期错误',
      `⚠️ 新合约结束日期 (${e}) 不能早于开始日期 (${s})，请重新选择！`
    );
    renewEndInput.value = ""; // 清空错误输入
    return;
  }
  recalcWorkingDays();
});
    }
  }, 0);
},


                handleTerminate(contract) {

                // 1. 获取学生信息用于展示
    // === 改造：在读取时过滤已删除 ===
    const student = App.state.students.find(s => s.id === contract.studentId && !s.is_deleted);
    const name = student ? student.name : '未知';
    const grade = student ? student.grade : '';

    // 2. 构建提示语 (使用 HTML 样式)
    const message = `
        <div class="alert alert-danger">
            <h6 class="alert-heading fw-bold"><i class="fas fa-exclamation-triangle me-2"></i>正在终止合约</h6>
            <hr>
            <p class="mb-1"><strong>学生：</strong>${name}（${grade}）</p>
            <p class="mb-0"><strong>周期：</strong>${contract.startDate} 至 ${contract.endDate}</p>
        </div>
        <p class="mb-0">
            <span class="text-danger fw-bold" style="font-size: 1.05rem;">确认要终止此合约记录吗？</span>
            <br>
            <span class="text-muted small">终止后将不可进行任何更改，且合同结束日期将修正为今天。</span>
        </p>
    `;

    UIModule.showConfirmation(
        '终止合约',
        message,
        () => {
            // ✅ 优化：使用全局 helper 获取北京时间日期字符串
            const beijingDateString = getBeijingDateString(); 

            // 将合约结束日期和北京时间字符串转换为日期对象进行比较
            // 使用 'T00:00:00' 确保比较的是同一天的零点，避免时分秒的干扰
            const contractEndDate = new Date(contract.endDate + 'T00:00:00');
            const beijingToday = new Date(beijingDateString + 'T00:00:00');

            // === 逻辑：结束日期处理 ===
            if (contractEndDate > beijingToday) {
                // 尚在有效期 (合约结束日期晚于北京今天) → 强制改为北京今天
                contract.endDate = beijingDateString;
            }
            // 如果 contractEndDate <= beijingToday，则保持原结束日期（可能是今天或已过期）

            // 更新状态
            contract.status = '已终止';

            // 保存与刷新
            this.saveState();
            this.renderTable();
            // (新) 如果到期提醒窗口是打开的，立即刷新它（该条目会自动消失）
    if (document.getElementById('expiringOverlayModal').classList.contains('show')) {
        this.checkExpiringContracts();
    }
            // 提示信息
            UIModule.showToast('合约已终止', 'success', 'center');
        }
    );
},

                handleDelete(contract) {
                    UIModule.showConfirmation('删除合约', '确认要彻底删除此合约记录吗？此操作不可撤销。', () => {
                        // === 改造：从 filter 改为 软删除 ===
                        // this.state.contracts = this.state.contracts.filter(c => c.id !== contract.id); // 旧代码
                        const contractToDel = this.state.contracts.find(c => c.id === contract.id);
                        if (contractToDel) contractToDel.is_deleted = true;
                        // === 改造结束 ===
                        this.saveState();
                        // === MODIFICATION END ===
                        this.renderTable();
                        UIModule.showToast('合约已删除', 'success', 'center');
                    });
                },

                // === 节假日模态框 ===
                handleOpenHolidayModal() {
                    // === MODIFIED: 从 this.state 读取 ===
                    const config = this.state.holidayConfig;
                    // === MODIFICATION END ===
                    this.holidayDatesInput.value = (config.holidays || []).join("\n");
                    this.workdayDatesInput.value = (config.workdays || []).join("\n");
                    this.holidayModal.show();
                },

                handleSaveHolidayConfig() {
                    const parseDates = (rawText) => {
                        return rawText.split(/\n/)
                            .map(s => s.trim())
                            .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)); // 验证格式
                    };
                    
                    const holidays = parseDates(this.holidayDatesInput.value);
                    const workdays = parseDates(this.workdayDatesInput.value);
                    
                    // === MODIFIED: 更新 this.state 和调用 this.saveState() ===
                    this.state.holidayConfig = { holidays, workdays };
                    this.saveState();
                    // === MODIFICATION END ===
                    UIModule.showToast('节假日设置已保存', 'success');
                    this.holidayModal.hide();
                    
                    this.handleStartDateChange();
                },

                // === 导出 ===
                // === 导出 ===
                handleExport() {
                    // (复用 renderTable 的逻辑来获取排序和筛选后的数据)
                    const nameFilter = this.filterNameSelect.value;
                    const statusFilter = this.filterStatusSelect.value;

                    // === 改造：在读取时过滤已删除 ===
                    let filteredContracts = this.state.contracts.filter(c => !c.is_deleted);
                    // === MODIFICATION END ===
                    const processedContracts = filteredContracts.map(c => {
                        // === 改造：在读取时过滤已删除 (从 App.state) ===
                        const student = App.state.students.filter(s => !s.is_deleted).find(s => s.id === c.studentId);
                        // === MODIFICATION END ===
                        const computedStatus = this.getContractStatus(c);
                        const daysRemaining = this.calculateDaysRemaining(c.endDate);
                        return {
                            ...c,
                            studentName: student ? student.name : '未知',
                            studentGrade: student ? student.grade : '未知',
                            computedStatus: computedStatus.text,
                            daysRemaining: daysRemaining
                        };
                    });
                    if (nameFilter) {
                        filteredContracts = processedContracts.filter(c => c.studentId === nameFilter);
                    } else {
                        filteredContracts = processedContracts;
                    }
                    if (statusFilter) {
                        filteredContracts = filteredContracts.filter(c => c.computedStatus === statusFilter);
                    }
                    filteredContracts.sort((a, b) => {
                        const aArchived = (a.computedStatus === '已续约' || a.computedStatus === '已终止');
                        const bArchived = (b.computedStatus === '已续约' || b.computedStatus === '已终止');
                        if (aArchived && !bArchived) return 1;
                        if (!aArchived && bArchived) return -1;
                        if (aArchived && bArchived) return 0;
                        return a.daysRemaining - b.daysRemaining;
                    });

                    if (filteredContracts.length === 0) {
                        UIModule.showToast('没有可导出的数据', 'info');
                        return;
                    }
                    
                    const dataToExport = filteredContracts.map((c, index) => ({
                        '序号': index + 1,
                        '姓名': c.studentName,
                        '年级': c.studentGrade,
                        '服务类型': c.serviceType,
                        '开始日期': c.startDate,
                        '结束日期': c.endDate,
                        '有效期(天)': c.daysRemaining,
                        '状态': c.computedStatus
                    }));
                    
                    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "合约列表");
                    XLSX.writeFile(workbook, `合约信息列表_${getBeijingDateString()}.xlsx`);
                    UIModule.showToast("导出成功！");
                },
                
                // === 新增：全量检查合约重叠 ===
checkOverlaps() {
    // 1. 准备数据
    const activeContracts = this.state.contracts.filter(c => !c.is_deleted);
    const activeStudentsMap = new Map(App.state.students.filter(s => !s.is_deleted).map(s => [s.id, s]));

    // 2. 按学生分组合约
    const contractsByStudent = {};
    activeContracts.forEach(c => {
        if (!contractsByStudent[c.studentId]) contractsByStudent[c.studentId] = [];
        contractsByStudent[c.studentId].push(c);
    });

    const conflicts = []; // 存储发现的冲突数据

    // 3. 遍历每个学生，进行两两比较 (O(N^2) per student, 但 N 很小，无性能问题)
    Object.keys(contractsByStudent).forEach(studentId => {
        const list = contractsByStudent[studentId];
        if (list.length < 2) return;

        // 仅检查有效状态的合约（生效中、即将过期、已过期、已续约）
        // 通常“已终止”的合约如果日期没修正也可能导致重叠，这里我们检查所有非软删除的，
        // 但为了严谨，可能需要排除已终止？
        // 需求说 "自动检测合约列表中是否有起止日期重叠"，建议包含所有可见合约以提示错误。
        
        // 我们可以先按开始日期排序
        list.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

        const studentConflicts = new Set(); // 使用 Set 避免同一个合约被多次记录

        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const c1 = list[i];
                const c2 = list[j];

                // 如果状态是已终止，且结束日期修正到了很久以前，可能不冲突。
                // 但这里我们纯粹按日期物理重叠来算。
                
                // 重叠判断逻辑：
                const start1 = new Date(c1.startDate + 'T00:00:00');
                const end1 = new Date(c1.endDate + 'T00:00:00');
                const start2 = new Date(c2.startDate + 'T00:00:00');
                const end2 = new Date(c2.endDate + 'T00:00:00');

                // (Start1 <= End2) and (End1 >= Start2)
                if (start1 <= end2 && end1 >= start2) {
                    studentConflicts.add(c1);
                    studentConflicts.add(c2);
                }
            }
        }

        if (studentConflicts.size > 0) {
            const studentName = activeStudentsMap.get(studentId) ? activeStudentsMap.get(studentId).name : '未知学生';
            const sortedConflicts = Array.from(studentConflicts).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
            conflicts.push({
                studentName: studentName,
                contracts: sortedConflicts
            });
        }
    });

    // 4. 根据结果决定流程
    if (conflicts.length > 0) {
        // 有冲突，显示冲突弹窗
        // 当冲突弹窗关闭时，会触发 hidden.bs.modal 事件去调用 checkExpiringContracts
        this.showOverlapOverlay(conflicts);
    } else {
        // 无冲突，直接走原来的过期检查流程
        this.checkExpiringContracts();
    }
},

// === 新增：显示重叠警告弹窗 ===
showOverlapOverlay(conflicts) {
    const body = document.getElementById('contractOverlapBody');
    if (!body) return;

    let html = '';

    conflicts.forEach(group => {
        html += `
        <div class="overlap-group-card">
            <div class="overlap-group-header">
                <i class="fas fa-user-graduate me-2"></i>${group.studentName}
            </div>
            <div class="overlap-group-body">
        `;
        
        group.contracts.forEach(c => {
            const statusObj = this.getContractStatus(c); // 获取状态文本
            html += `
                <div class="overlap-item">
                    <div>
                        <span class="badge bg-light text-dark border me-2">${c.serviceType}</span>
                        <span class="date-highlight-conflict">${c.startDate} 至 ${c.endDate}</span>
                    </div>
                    <div>
                        <span class="${statusObj.class} small">${statusObj.text}</span>
                    </div>
                </div>
            `;
        });

        html += `
            </div>
        </div>
        `;
    });

    body.innerHTML = html;

    if (this.overlapModal) {
        this.overlapModal.show();
    }
},

                // === 合同到期提醒：计算过期与即将到期 ===
checkExpiringContracts() {
    // 1. 筛选数据
    const expired = this.state.contracts.filter(c => {
        const days = this.calculateDaysRemaining(c.endDate);
        return !c.is_deleted && days < 0 && c.status !== '已续约' && c.status !== '已终止';
    });

    const expiringSoon = this.state.contracts.filter(c => {
        const days = this.calculateDaysRemaining(c.endDate);
        return !c.is_deleted && days >= 0 && days <= 7 && c.status === '生效中';
    });

    // 2. 检查当前弹窗是否处于打开状态
    const isModalOpen = this.expiringOverlayModal && document.getElementById('expiringOverlayModal').classList.contains('show');

    // 3. 逻辑分支处理
    if (expired.length > 0 || expiringSoon.length > 0) {
        // 情况A：有数据 -> 无论是首次打开还是数据更新，都显示/刷新弹窗
        this.showExpiringOverlay(expired, expiringSoon);
    } else if (isModalOpen) {
        // 情况B：没有数据，但弹窗当前是打开的 -> 说明用户处理完了所有条目，自动关闭弹窗
        this.expiringOverlayModal.hide();
    }
    // 情况C：没有数据且弹窗未打开 -> 什么都不做
},

// === 合同到期提醒：弹层提醒（增强续约与终止功能）===
showExpiringOverlay(expiredContracts, expiringSoonContracts) {
    const body = document.getElementById('expiringOverlayBody');
    let html = '';

    // === (新增) 优化：创建 Active Students Map ===
    const activeStudentsMap = new Map(App.state.students
        .filter(s => !s.is_deleted)
        .map(s => [s.id, s])
    );

    const getStudentInfo = (id) => {
        const student = activeStudentsMap.get(id);
        return student 
            ? `${student.name} (${student.grade})` 
            : '未知学生 (可能已被删除)';
    };
    // === 优化结束 ===

    // 按结束日期升序排序
    expiredContracts.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    expiringSoonContracts.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

    // 定义操作按钮的生成函数
    const renderActions = (contractId) => {
        return `
        <span class="ms-2 ps-2 border-start border-secondary">
            <a href="javascript:void(0)" class="text-primary text-decoration-none fw-bold me-2" data-action="renew" data-id="${contractId}">[续约]</a>
            <a href="javascript:void(0)" class="text-danger text-decoration-none fw-bold" data-action="terminate" data-id="${contractId}">[终止]</a>
        </span>`;
    };

    // === 修改点：forEach 中增加 index 参数，并在显示时使用 index + 1 ===

    if (expiredContracts.length > 0) {
        html += `<h6 class="text-danger fw-bold mb-2">已过期（尚未续约或终止）</h6>`;
        expiredContracts.forEach((c, index) => { // 增加 index
            html += `
              <div class="mb-3 border border-danger rounded p-2 bg-light">
                  <strong class="d-block mb-2">
                    ${index + 1}. ${getStudentInfo(c.studentId)} </strong>
                  <div class="d-flex flex-wrap gap-3 align-items-center">
                    <span>服务类型：${c.serviceType}</span>
                    <span>开始日期：${c.startDate}</span>
                    <span>结束日期：${c.endDate}</span>
                    <span>状态：${c.status} ${renderActions(c.id)}</span>
                  </div>
                </div>`;
        });
    }

    if (expiringSoonContracts.length > 0) {
        html += `<h6 class="text-warning fw-bold mb-2">七天内即将到期</h6>`;
        expiringSoonContracts.forEach((c, index) => { // 增加 index
            html += `
              <div class="mb-3 border border-warning rounded p-2 bg-light">
                  <strong class="d-block mb-2">
                    ${index + 1}. ${getStudentInfo(c.studentId)} </strong>
                  <div class="d-flex flex-wrap gap-3 align-items-center">
                    <span>服务类型：${c.serviceType}</span>
                    <span>开始日期：${c.startDate}</span>
                    <span>结束日期：${c.endDate}</span>
                    <span>状态：${c.status} ${renderActions(c.id)}</span>
                  </div>
                </div>`;
        });
    }

    body.innerHTML = html;

    if (!this.expiringOverlayModal) return;
    this.expiringOverlayModal.show();
},

            };

          
            // =================================================================================
// PROGRESS MODULE (仅显示三年级到九年级的学生作业完成进度)
// =================================================================================
const ProgressModule = {
    head: document.getElementById('progressTableHead'),
    body: document.getElementById('progressTableBody'),
    filterContainer: document.getElementById('progressGradeFilter'),
    selectAllCheckbox: document.getElementById('progressSelectAllGrades'),
    
    // === 核心定义：允许显示的有效年级白名单 ===
    // 把它提取出来，供 filter 标签生成和表格渲染共用
    validGrades: ['三年级','四年级','五年级','六年级','七年级','八年级','九年级'],

    init() {
        this.renderGradeFilters();
        this.filterContainer.addEventListener('change', () => this.render());
        this.selectAllCheckbox.addEventListener('change', this.handleSelectAll.bind(this));
    },
    
    renderGradeFilters() {
        // === 修复点 1：顶部标签生成时，先过滤掉不需要的年级 ===
        const gradesToShow = App.grades.filter(g => this.validGrades.includes(g));

        this.filterContainer.innerHTML = gradesToShow.map(grade => 
            `<div class="checkbox-tag">
                <input type="checkbox" id="progress-grade-${grade}" name="progressGradeFilter" value="${grade}" checked>
                <label for="progress-grade-${grade}">${grade}</label>
            </div>`
        ).join('');
    },
    
    handleSelectAll() {
        const isChecked = this.selectAllCheckbox.checked;
        this.filterContainer.querySelectorAll('input').forEach(cb => cb.checked = isChecked);
        this.render();
    },

    render() {
        // === 1. 准备科目并排序 ===
        const allSubjects = App.state.subjects.filter(s => !s.is_deleted);
        
        const SUBJECT_ORDER = [
            '语文','数学','英语','物理','化学',
            '道法','历史','生物','地理','科学','其他'
        ];

        allSubjects.sort((a, b) => {
            const idxA = SUBJECT_ORDER.indexOf(a.name);
            const idxB = SUBJECT_ORDER.indexOf(b.name);
            return (idxA === -1 ? SUBJECT_ORDER.length : idxA) -
                   (idxB === -1 ? SUBJECT_ORDER.length : idxB);
        });

        // 渲染表头
        this.head.innerHTML = `<tr><th>序号</th><th>姓名</th><th>年级</th>${allSubjects.map(s => `<th>${s.name}</th>`).join('')}</tr>`;

        // === 2. 获取过滤条件 ===
        // 2.1 获取 UI 上选中的年级
        const selectedGrades = Array.from(this.filterContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        
        // 更新全选框状态 (根据当前显示的有效年级数量判断)
        // 注意：这里比较的是当前 validGrades 的长度，而不是 App.grades 的长度
        this.selectAllCheckbox.checked = selectedGrades.length === this.validGrades.length;

        // 2.2 获取日期范围
        const start = (App.currentFilter && App.currentFilter.start) || getBeijingDateString();
        const end = (App.currentFilter && App.currentFilter.end) || start;

        // === 3. 获取作业数据 (用于筛选“有作业”的学生) ===
        const todaysHomeworks = App.state.homeworks.filter(h => !h.is_deleted && h.date >= start && h.date <= end);
        
        // 提取有作业的学生ID集合
        const activeStudentIds = new Set(todaysHomeworks.map(h => h.studentId));

        // 构建作业映射 Map
        const homeworkMap = new Map();
        todaysHomeworks.forEach(h => {
            const key = `${h.studentId}-${h.subjectId}`;
            if (!homeworkMap.has(key)) homeworkMap.set(key, []);
            homeworkMap.get(key).push(h);
        });

        // === 4. 筛选并排序学生 ===
        const gradeOrder = App.grades;
        
        const studentsToDisplay = App.state.students
            .filter(s => {
                // 基础：未软删除
                if (s.is_deleted) return false;
                
                // === 修复点 2：双重年级过滤 ===
                
                // A. 必须属于我们定义的白名单 (3-9年级)
                if (!this.validGrades.includes(s.grade)) return false;

                // B. 必须在 UI 上被勾选 (例如用户只想看三年级)
                if (!selectedGrades.includes(s.grade)) return false;

                // === 修复点 3：必须有有效作业 ===
                if (!activeStudentIds.has(s.id)) return false;

                return true;
            })
            .sort((a, b) => {
                const gradeDiff = gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade);
                if (gradeDiff !== 0) return gradeDiff;
                return a.name.localeCompare(b.name, 'zh-Hans-CN');
            });

        // === 5. 生成 HTML ===
        if (studentsToDisplay.length === 0) {
            this.body.innerHTML = `<tr><td colspan="${3 + allSubjects.length}" class="text-center">没有符合条件的学生（仅显示3-9年级且有作业记录的学生）</td></tr>`;
            return;
        }

        this.body.innerHTML = studentsToDisplay.map((student, index) => {
            let rowHTML = `<tr><td>${index + 1}</td><td>${student.name}</td><td>${student.grade}</td>`;
            
            allSubjects.forEach(subject => {
                const key = `${student.id}-${subject.id}`;
                const studentHomeworksForSubject = homeworkMap.get(key) || [];
                let status = "无", statusClass = "status-none", statusTextClass = "status-none-text";
                
                if (studentHomeworksForSubject.length > 0) {
                    const completedCount = studentHomeworksForSubject.filter(h => h.status === '已完成').length; 
                    const partialCount = studentHomeworksForSubject.filter(h => h.status === '部分完成').length;
                    
                    if (completedCount === studentHomeworksForSubject.length) { 
                        status = "已完成"; statusClass = "status-completed"; statusTextClass = "status-completed-text"; 
                    } 
                    else if (completedCount > 0 || partialCount > 0) { 
                        status = "部分完成"; statusClass = "status-partial"; statusTextClass = "status-partial-text"; 
                    } 
                    else { 
                        status = "未完成"; statusClass = "status-uncompleted"; statusTextClass = "status-uncompleted-text"; 
                    }
                }
                rowHTML += `<td class="${statusClass}"><span class="${statusTextClass}">${status}</span></td>`;
            });
            return rowHTML + '</tr>';
        }).join('');
    }
};
            
            // =================================================================================
            // LARGE SCREEN MODULE
            // =================================================================================
            const LargeScreenModule = {
                modalBody: document.getElementById('largeScreenModalBody'),
                fullscreenBtn: document.getElementById('fullscreenBtn'),
                darkModeToggleBtn: document.getElementById('darkModeToggleBtn'),
                // (V3) 更改为 Map 来存储更复杂的观察者状态
                visibilityObservers: new Map(), // 格式: [regionBody, { observer, ... }]
                init() {
                    if (this.fullscreenBtn) this.fullscreenBtn.addEventListener('click', this.toggleFullscreen.bind(this));
                    if (this.darkModeToggleBtn) this.darkModeToggleBtn.addEventListener('click', this.toggleDarkMode.bind(this));
                    document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
                    if (this.modalBody) this.modalBody.addEventListener('click', this.handleCardClick.bind(this));
                },
              // (V3) 停止所有 Intersection Observers (使用 Map.clear)
                stopVisibilityObservers() {
                    this.visibilityObservers.forEach(({ observer }) => observer.disconnect());
                    this.visibilityObservers.clear();
    },
    // (新) 设置 Intersection Observers
    // (V3) 设置 Intersection Observers（核心修改：观察 header）
                setupVisibilityObservers() {
                    this.stopVisibilityObservers(); // 确保先清理

                    document.querySelectorAll('.grade-region').forEach(region => {
                        const regionBody = region.querySelector('.grade-region-body');
                        const floatingCard = region.querySelector('.floating-name-card');
                        
                        // 必须同时存在滚动容器和浮动卡片
                        if (!regionBody || !floatingCard) return;

                        // 1. 创建指标映射 (学生ID -> indicator元素)
                        const indicatorMap = new Map();
                        floatingCard.querySelectorAll('li[data-student-id]').forEach(li => {
                            const indicator = li.querySelector('.indicator');
                            if (indicator) {
                                indicatorMap.set(li.dataset.studentId, indicator);
                            }
                        });

                        if (indicatorMap.size === 0) return; // 没有可映射的指标

                        // 2. (V3) 存储状态
                        // Map [headerElement, isVisible]
                        const headerVisibilityMap = new Map(); 
                        // Set [studentId]
                        const visibleStudentIds = new Set(); 

                        // 3. 定义回调
                        const observerCallback = (entries) => {
                            // 3.1 更新所有发生变化的 header 的状态
                            entries.forEach(entry => {
                                headerVisibilityMap.set(entry.target, entry.isIntersecting);
                            });
                            
                            // (新) 用于存储本次回调中第一个变为可见的 li 元素
                            let firstNewlyVisibleLi = null;

                            // 3.2 重新计算 *每个学生* 的总体可见性
                            indicatorMap.forEach((indicator, studentId) => {
                                const allHeadersForStudent = region.querySelectorAll(
                                    `.large-screen-card[data-student-id="${studentId}"] .large-screen-card-header`
                                );

                                // 检查是否有 *任何* 一个该学生的 header 当前是可见的
                                const isAnyVisible = Array.from(allHeadersForStudent).some(header => 
                                    headerVisibilityMap.get(header) === true // 检查存储的状态
                                );

                                // 3.3 更新指示器
                                const wasVisible = visibleStudentIds.has(studentId);
                                
                                if (isAnyVisible) {
                                    if (!wasVisible) {
                                        visibleStudentIds.add(studentId);
                                        indicator.classList.add('is-visible');
                                        // (新) 捕获这个 li 元素
                                        const liElement = indicator.parentElement;
                                        if (liElement && !firstNewlyVisibleLi) {
                                            firstNewlyVisibleLi = liElement;
                                        }
                                    }
                                } else {
                                    if (wasVisible) {
                                        visibleStudentIds.delete(studentId);
                                        indicator.classList.remove('is-visible');
                                    }
                                }
                            });
                            // (新) 在所有状态更新后，执行一次滚动
                            if (firstNewlyVisibleLi) {
                                // .floating-name-card 是 <li> 的可滚动祖先
                                // block: 'nearest' 确保如果它已经在视图中，就不会滚动
                                firstNewlyVisibleLi.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center' // <--- 在这里修改
                                });
                            }
                        };

                        // 4. 创建 Observer
                        const observer = new IntersectionObserver(observerCallback, {
                            root: regionBody,       // 关键：以 .grade-region-body 为 "视口"
                            rootMargin: '0px',
                            threshold: 0.01         // (V3) 标题出现 1% 就触发
                        });

                        // 5. (V3) 观察所有 *卡片标题*
                        region.querySelectorAll('.large-screen-card-header').forEach(header => {
                            // 初始化状态
                            headerVisibilityMap.set(header, false); 
                            observer.observe(header);
                        });

                        // 6. 存储 Observer 和状态
                        this.visibilityObservers.set(regionBody, { 
                            observer, 
                            headerVisibilityMap, 
                            visibleStudentIds, 
                            indicatorMap 
                        });
                    });
                },
                bindScreenshotEvents() {
    const icons = document.querySelectorAll('.large-screen-screenshot-icon');
    icons.forEach(icon => {
        icon.addEventListener('click', () => {
            const cardNode = icon.closest('.large-screen-card');
            if (!cardNode) return;

            safeDomToImage(cardNode).then(blob => {
                if (blob && blob.size > 0) {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]).then(() => {
                        UIModule.showToast('截图已复制到剪贴板', 'success');
                    }).catch(err => {
                        console.error('复制截图失败', err);
                        UIModule.showToast('复制截图失败', 'danger');
                    });
                }
            });
        });
    });
},

               handleCardClick(e) {
    const screenshotIcon = e.target.closest('.large-screen-screenshot-icon');
    if (!screenshotIcon) return;
    const card = screenshotIcon.closest('.large-screen-card');
    if (!card) return;

    screenshotIcon.style.visibility = 'hidden';

    // 超采样倍数：设备像素比 × 2（可调到 ×3）
    const scale = (window.devicePixelRatio || 2) * 3;

    // 检测暗色模式
    const isDarkMode = document.querySelector('#largeScreenModalBody')?.classList.contains('dark-mode');

    domtoimage.toBlob(card, {
        bgcolor: isDarkMode ? '#121212' : '#ffffff',
        quality: 1,
        // 不再额外加 borderWidth，直接用原始尺寸
        width: card.offsetWidth * scale,
        height: card.offsetHeight * scale,
        style: {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            boxSizing: 'border-box',
            // 移除边框相关设置
            backgroundColor: isDarkMode ? '#2b2b2b' : '#ffffff',
            color: isDarkMode ? '#e0e0e0' : '#333333',
            '-webkit-font-smoothing': 'antialiased',
            'text-rendering': 'geometricPrecision'
        }
    }).then(blob => {
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => {
                UIModule.showToast('超高清截图已复制到剪贴板！');
            })
            .catch(err => {
                console.warn('无法写入剪贴板，改为下载:', err);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'screenshot_ultra.png';
                a.click();
                URL.revokeObjectURL(url);
                UIModule.showToast('超高清截图已下载到本地！', 'info');
            });
    }).catch(err => {
        console.error('截图生成失败:', err);
        UIModule.showToast('截图生成失败。', 'error');
    }).finally(() => {
        screenshotIcon.style.visibility = 'visible';
    });
},


                toggleFullscreen() {
                    if (this.modalBody && !document.fullscreenElement) {
                        this.modalBody.requestFullscreen().catch(err => { alert(`全屏模式错误: ${err.message}`); });
                    } else if (document.fullscreenElement) {
                        document.exitFullscreen();
                    }
                },
                toggleDarkMode() {
                    if (!this.modalBody) return;
                    this.modalBody.classList.toggle('dark-mode');
                    const icon = this.darkModeToggleBtn && this.darkModeToggleBtn.querySelector('i');
                    if (!icon) return;
                    if (this.modalBody.classList.contains('dark-mode')) {
                        icon.classList.remove('fa-moon');
                        icon.classList.add('fa-sun');
                        this.darkModeToggleBtn.setAttribute('title', '切换浅色模式');
                    } else {
                        icon.classList.remove('fa-sun');
                        icon.classList.add('fa-moon');
                        this.darkModeToggleBtn.setAttribute('title', '切换深色模式');
                    }
                },
                handleFullscreenChange() {
    const modalEl = document.getElementById('largeScreenModal');
    if (!modalEl) return;

    const header = modalEl.querySelector('.modal-header');
    const screenshotIcons = this.modalBody ? this.modalBody.querySelectorAll('.large-screen-screenshot-icon') : [];

    if (document.fullscreenElement) {
        if (header) {
            header.querySelectorAll('.modal-title, .btn-close').forEach(el => el.style.display = 'none');
            header.style.background = 'transparent';
            header.style.border = 'none';
        }
        screenshotIcons.forEach(icon => icon.style.display = 'none');

        // 统一走 render，让顺序和 rAF 都一致
        this.render();
    } else {
        if (header) {
            header.querySelectorAll('.modal-title, .btn-close').forEach(el => el.style.display = '');
            header.style.background = '';
            header.style.border = '';
        }
        if (this.modalBody) this.modalBody.classList.remove('dark-mode');
        if (this.darkModeToggleBtn) {
            const icon = this.darkModeToggleBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
            this.darkModeToggleBtn.setAttribute('title', '切换深色模式');
        }

        this.stopAutoScroll();
        this.stopVisibilityObservers();

        // 退出全屏后也统一走 render，恢复静态视图与观察者
        this.render();
    }
},
                stopAutoScroll() {
                    if (!this.modalBody) return;
                    this.modalBody.querySelectorAll('.grade-region-body').forEach(regionBody => {
                        regionBody.classList.remove('autoscroll-enabled');
                        const contentWrapper = regionBody.querySelector('.autoscroll-content');
                        if (contentWrapper) regionBody.innerHTML = '';
                    });
                },
                updateLiveContent(allHomeworks) {
    try {
        const start = (App.currentFilter && App.currentFilter.start) || getBeijingDateString();
        const end = (App.currentFilter && App.currentFilter.end) || start;
        const todaysHomeworks = (allHomeworks || []).filter(h => h.date >= start && h.date <= end);

        const homeworkMap = todaysHomeworks.reduce((map, hw) => { 
            map[hw.id] = hw; 
            return map; 
        }, {});

        document.querySelectorAll('.large-screen-homework-item[data-homework-id]').forEach(itemEl => {
            const homeworkId = itemEl.dataset.homeworkId;
            const homework = homeworkMap[homeworkId];
            const statusLabel = itemEl.querySelector('.large-screen-status-label');
            if (!statusLabel) return;

            if (homework) {
                let labelText = '未完成';
                if (homework.status === '已完成') labelText = '已完成';
                else if (homework.status === '部分完成') labelText = '部分完成';

                let bgColorClass = 'status-red-bg';
                if (homework.status === '已完成') bgColorClass = 'status-green-bg';
                else if (homework.status === '部分完成') bgColorClass = 'status-yellow-bg';

                let textColorClass = 'status-uncompleted-text';
                if (homework.status === '已完成') textColorClass = 'status-completed-text';
                else if (homework.status === '部分完成') textColorClass = 'status-partial-text';

                statusLabel.className = `large-screen-status-label ${bgColorClass} ${textColorClass}`;
                statusLabel.textContent = labelText;
            } else {
                statusLabel.className = 'large-screen-status-label status-none';
                statusLabel.textContent = '';
            }
        });

        // 如果只是状态变化，不重建 DOM——保持观察者和指示器不变
    } catch (err) {
        console.warn('LargeScreenModule.updateLiveContent error', err);
    }

    // 移除这行（它会重复注册且没有绑定到 this）：
    // document.addEventListener('fullscreenchange', handleFullscreenChange);
},

                startAutoScroll() {
                    if (!this.modalBody) return;
                    this.modalBody.querySelectorAll('.grade-region-body').forEach(regionBody => {
                        regionBody.classList.add('autoscroll-enabled');
                        const contentHeight = regionBody.scrollHeight;
                        const visibleHeight = regionBody.clientHeight;
                        if (contentHeight > visibleHeight) {
                            const originalContent = regionBody.innerHTML;
                            const contentWrapper = document.createElement('div');
                            contentWrapper.className = 'autoscroll-content';
                            contentWrapper.innerHTML = originalContent + originalContent;
                            regionBody.innerHTML = '';
                            regionBody.appendChild(contentWrapper);
                            const duration = Math.max(20, (contentHeight / 1000) * 80); // 80秒每1000px
                            contentWrapper.style.animationDuration = `${duration}s`;
                        }
                    });
                },

                render() {
    // 停止旧观察者，避免悬挂
    this.stopVisibilityObservers(); //

    // --- (核心修改：步骤 1) ---
    // (A) 从 App.currentFilter 中解构出 *所有* 筛选条件
    const {
        start = getBeijingDateString(), //
        end = start, //
        studentFilters = [], // <-- (新) 读取姓名过滤器
        statusFilters = []  // <-- (新) 读取状态过滤器
    } = App.currentFilter || {};
    // --- (核心修改结束) ---

    // === 改造：在读取时过滤已删除 ===
    // (B) 步骤 2：先按日期筛选
    let todaysHomeworks = App.state.homeworks.filter(h => !h.is_deleted && h.date >= start && h.date <= end); //

    // --- (核心修改：步骤 3) ---
    // (C) (新) 在日期基础上，再应用姓名过滤器
    if (studentFilters.length > 0) {
        todaysHomeworks = todaysHomeworks.filter(h => studentFilters.includes(h.studentId));
    }

    // (D) (新) 在姓名基础上，再应用状态过滤器
    if (statusFilters.length > 0) {
        todaysHomeworks = todaysHomeworks.filter(h => statusFilters.includes(h.status));
    }
    // --- (核心修改结束) ---

    // (E) 之后的所有代码都不变，因为它们现在会使用被正确筛选过的 `todaysHomeworks`
    const regions = {
        primary: document.getElementById('largeScreenPrimary'),
        grade7: document.getElementById('largeScreenGrade7'),
        grade89: document.getElementById('largeScreenGrade89')
    }; //
    Object.values(regions).forEach(r => { if (r) r.innerHTML = ''; }); //

    // === 改造：在读取时过滤已删除 ===
    const studentMap = new Map(App.state.students.filter(s => !s.is_deleted).map(s => [s.id, s])); //

    // === 新增：按年级排序 ===
    const gradeOrder = {
        '一年级': 1, '二年级': 2, '三年级': 3,
        '四年级': 4, '五年级': 5, '六年级': 6,
        '七年级': 7, '八年级': 8, '九年级': 9
    }; //

    // === 改造：在读取时过滤已删除 ===
    const sortedStudents = App.state.students.filter(s => !s.is_deleted).sort((a, b) => {
        return (gradeOrder[a.grade] || 99) - (gradeOrder[b.grade] || 99);
    }); //

    sortedStudents.forEach(student => {
        // (这里的 studentHomeworks 是从 *已经被筛选过* 的 todaysHomeworks 中再次过滤的)
        const studentHomeworks = todaysHomeworks.filter(h => h.studentId === student.id); //
        if (studentHomeworks.length === 0) return; //

        const cardHTML = this.createStudentCard(student, studentHomeworks); //

        if (['三年级','四年级','五年级','六年级'].includes(student.grade) && regions.primary) { //
            regions.primary.innerHTML += cardHTML; //
        } else if (student.grade === '七年级' && regions.grade7) { //
            regions.grade7.innerHTML += cardHTML; //
        } else if (['八年级', '九年级'].includes(student.grade) && regions.grade89) { //
            regions.grade89.innerHTML += cardHTML; //
        }
    });

    Object.values(regions).forEach(r => { 
        if (r && r.innerHTML === '') r.innerHTML = '<div class="text-center text-muted p-5">暂无作业</div>'; 
    }); //
    
    this.bindScreenshotEvents(); //

    // 先生成浮动卡片（基于最新卡片）
    generateFloatingCards(); //

    // 如果当前在全屏模式，先启动自动滚动（这一步会替换 DOM）
    if (document.fullscreenElement) { //
        this.startAutoScroll(); //
    }

    // 用 rAF 延后一帧绑定观察者，确保绑定针对滚动替换后的最新节点
    requestAnimationFrame(() => { //

    // (新) 步骤 1: 仅在全屏时，先启动滚动
    // 此时 scrollHeight 已经是准确的
    if (document.fullscreenElement) { 
        this.startAutoScroll(); 
    }
        this.setupVisibilityObservers(); //

        // 如果你的滚动替换/样式计算还会在下一帧继续变动，可再加一层 rAF 做稳态绑定：
        requestAnimationFrame(() => { //
            // 容错：再绑定一次，覆盖潜在竞态
            this.stopVisibilityObservers(); //
            this.setupVisibilityObservers(); //
        });
    });
},

createStudentCard(student, homeworks) {
    const totalTasks = homeworks.length;
    const completedTasks = homeworks.filter(h => h.status === '已完成').length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 构建科目映射，避免重复 find
    // === 改造：在读取时过滤已删除 ===
    const subjectMap = new Map(App.state.subjects.filter(s => !s.is_deleted).map(s => [s.id, s]));

    // 先按科目分组
    const homeworksBySubject = homeworks.reduce((acc, hw) => {
        const subject = subjectMap.get(hw.subjectId);
        const subjectName = subject ? subject.name : '未知科目';
        (acc[subjectName] = acc[subjectName] || []).push(hw);
        return acc;
    }, {});

    // ✅ 固定科目顺序表
    const SUBJECT_ORDER = [
        '语文','数学','英语','物理','化学',
        '道法','历史','生物','地理','科学','其他'
    ];

    // ✅ 按 SUBJECT_ORDER 排序科目分组
    const orderedSubjects = Object.entries(homeworksBySubject).sort(([aName], [bName]) => {
        const idxA = SUBJECT_ORDER.indexOf(aName);
        const idxB = SUBJECT_ORDER.indexOf(bName);
        return (idxA === -1 ? SUBJECT_ORDER.length : idxA) -
               (idxB === -1 ? SUBJECT_ORDER.length : idxB);
    });

    return `
    <div class="large-screen-card" data-student-id="${student.id}">
        <div class="large-screen-card-header">
            <span>${formatStudentHeader(student.name, student.grade)}</span>
            <div>
                <i class="fas fa-camera large-screen-screenshot-icon" title="截图"></i>
            </div>
        </div>
        <div class="large-screen-card-body">
            ${orderedSubjects.map(([subjectName, hws]) => {

                // === 修复：在处理 hws 数组前，对其排序 ===
            hws.sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
            // === 修复结束 ===

                // 在科目下再按日期分组
                const byDate = hws.reduce((acc, hw) => {
                    (acc[hw.date] = acc[hw.date] || []).push(hw);
                    return acc;
                }, {});

                // ✅ 按日期升序排序
                const orderedDates = Object.entries(byDate).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));

                return `
                <div class="large-screen-subject-group">
                    <div class="large-screen-subject-title">${subjectName}</div>
                    ${orderedDates.map(([date, dateHws]) => { 
                        // === 修复：对 dateHws 数组排序 ===
                    dateHws.sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
                    // === 修复结束 ===

                    return `
                        <div class="large-screen-date-group">
                            <div class="text-muted mb-1" style="font-size:0.85rem;">${date}</div>
                            ${dateHws.map(hw => {
                                let labelText = '未完成';
                                if (hw.status === '已完成') labelText = '已完成';
                                else if (hw.status === '部分完成') labelText = '部分完成';

                                let bgColorClass = 'status-red-bg';
                                if (hw.status === '已完成') bgColorClass = 'status-green-bg';
                                else if (hw.status === '部分完成') bgColorClass = 'status-yellow-bg';

                                let textColorClass = 'status-uncompleted-text';
                                if (hw.status === '已完成') textColorClass = 'status-completed-text';
                                else if (hw.status === '部分完成') textColorClass = 'status-partial-text';

                                return `
                                <div class="large-screen-homework-item" data-homework-id="${hw.id}">
                                    <span class="large-screen-status-label ${bgColorClass} ${textColorClass}">${labelText}</span>
                                    <div class="homework-text large-screen-homework-text">${hw.task}</div>
                                </div>`;
                            }).join('')}
                        </div>
                    `}).join('')}
                </div>`;
            }).join('')}
        </div>
    </div>`;
}


            };

// === 找到并替换原有的 generateFloatingCards() 函数 ===

// === 生成浮动卡片（去重 + 自动移除 + 增加指示器结构） ===
function generateFloatingCards() {
  document.querySelectorAll('.grade-region').forEach(region => {
    // 清理旧卡片
    const oldCard = region.querySelector('.floating-name-card');
    if (oldCard) oldCard.remove();

    // 收集学生姓名和ID
    const students = new Map(); // 使用 Map 去重

    // (关键修改) 迭代卡片，而不是标题
    region.querySelectorAll('.large-screen-card[data-student-id]').forEach(card => {
      const studentId = card.dataset.studentId;
      if (!studentId || students.has(studentId)) return; // 跳过重复或无效的
      
      const header = card.querySelector('.large-screen-card-header');
      if (header) {
        // 尝试只获取第一个 span 的文本，避免抓到 "截图" 图标的 title
        const nameSpan = header.querySelector('span');
        const name = (nameSpan ? nameSpan.textContent.trim() : header.textContent.trim());
        if (name) {
             students.set(studentId, name);
        }
      }
    });

    if (students.size === 0) return;

    // 创建浮动卡片
    const card = document.createElement('div');
    card.className = 'floating-name-card';
    const list = document.createElement('ul');

    // (关键修改) 生成新的 li 结构
    students.forEach((name, studentId) => {
      const li = document.createElement('li');
      li.dataset.studentId = studentId; // 链接到卡片
      li.innerHTML = `
        <span class="indicator"></span>
        <span class="name-text">${name}</span> 
      `;
      list.appendChild(li);
    });
    
    card.appendChild(list);
    region.appendChild(card);
  });
}

            // =================================================================================
// DASHBOARD MODULE
// =================================================================================
const DashboardModule = {
                modalEl: document.getElementById('dashboardModal'),
                refreshBtn: document.getElementById('dashboardRefreshBtn'),

                // *** (优化) 缓存 DOM 元素 ***
                dashTotalStudentsEl: null,
                dashGradeDistributionEl: null,
                dashServiceDistributionEl: null,
                dashLateFullDistributionEl: null,
                dashExpiredTbodyEl: null,
                dashExpiringTbodyEl: null,
  init() {
    if (this.modalEl) {
      this.modalEl.addEventListener('shown.bs.modal', () => this.render());
    }
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.render());
    }
                    // *** (优化) 在 init 中缓存元素 ***
                    this.dashTotalStudentsEl = document.getElementById('dashTotalStudents');
                    this.dashGradeDistributionEl = document.getElementById('dashGradeDistribution');
                    this.dashServiceDistributionEl = document.getElementById('dashServiceDistribution');
                    this.dashLateFullDistributionEl = document.getElementById('dashLateFullDistribution');
                    this.dashExpiredTbodyEl = document.getElementById('dashExpiredTbody');
                    this.dashExpiringTbodyEl = document.getElementById('dashExpiringTbody');
   },

  // Helpers
  formatPercent(n, total) {
    if (total <= 0) return '0%';
    return Math.round((n / total) * 100) + '%';
  },

  // Core render
  // *** (优化) 使用缓存的 DOM 元素 ***

  render() {
                    try {
                        // === 改造：在读取时过滤已删除 ===
                        const students = (App.state.students || []).filter(s => !s.is_deleted);
                        const contracts = (ContractModule && ContractModule.state && ContractModule.state.contracts) 
                            ? ContractModule.state.contracts.filter(c => !c.is_deleted) 
                            : [];

                        // 1) 学生总数
                        const totalStudents = students.length;
                        if (this.dashTotalStudentsEl) this.dashTotalStudentsEl.textContent = String(totalStudents);

                        // 2) 年级分布
                        const gradeMap = {};
                        students.forEach(s => { gradeMap[s.grade] = (gradeMap[s.grade] || 0) + 1; });
                        if (this.dashGradeDistributionEl) {
                            if (Object.keys(gradeMap).length === 0) {
                                this.dashGradeDistributionEl.innerHTML = '<div class="text-muted">暂无数据</div>';
                            } else {
                                const html = Object.entries(gradeMap)
                                    .sort((a,b) => App.grades.indexOf(a[0]) - App.grades.indexOf(b[0]))
                                    .map(([grade, cnt]) => {
                                    return `<div class="dash-item"><span class="label">${grade}</span><span class="value">${cnt}（${this.formatPercent(cnt, totalStudents)}）</span></div>`;
                                    }).join('');
                                this.dashGradeDistributionEl.innerHTML = html;
                            }
                        }

                        // 3) 服务类型分布
                        const activeContracts = contracts.filter(c => {
                            const st = ContractModule.getContractStatus(c).text;
                            return st !== '已续约' && st !== '已终止';
                        });
                        const serviceMap = {};
                        activeContracts.forEach(c => { serviceMap[c.serviceType] = (serviceMap[c.serviceType] || 0) + 1; });
                        if (this.dashServiceDistributionEl) {
                            if (Object.keys(serviceMap).length === 0) {
                                this.dashServiceDistributionEl.innerHTML = '<div class="text-muted">暂无数据</div>';
                            } else {
                                const totalContracts = activeContracts.length;
                                const html = Object.entries(serviceMap)
                                    .map(([svc, cnt]) => {
                                    return `<div class="dash-item"><span class="label">${svc}</span><span class="value">${cnt}（${this.formatPercent(cnt, totalContracts)}）</span></div>`;
                                    }).join('');
                                this.dashServiceDistributionEl.innerHTML = html;
                            }
                        }

                        // 4) 晚托与全托的年级分布
                        const lateFull = activeContracts.filter(c => c.serviceType === '晚托' || c.serviceType === '全托');
                        const gradeMapLF = {};
                        lateFull.forEach(c => {
                            const stu = students.find(s => s.id === c.studentId);
                            const grade = stu ? stu.grade : '未知';
                            gradeMapLF[grade] = (gradeMapLF[grade] || 0) + 1;
                        });
                        if (this.dashLateFullDistributionEl) {
                            if (lateFull.length === 0) {
                                this.dashLateFullDistributionEl.innerHTML = '<div class="text-muted">暂无晚托/全托数据</div>';
                            } else {
                                const totalLF = lateFull.length;
                                const html = Object.entries(gradeMapLF)
                                    .sort((a,b) => App.grades.indexOf(a[0]) - App.grades.indexOf(b[0]))
                                    .map(([grade, cnt]) => {
                                    return `<div class="dash-item"><span class="label">${grade}</span><span class="value">${cnt}（${this.formatPercent(cnt, totalLF)}）</span></div>`;
                                    }).join('');
                                this.dashLateFullDistributionEl.innerHTML = html;
                            }
                        }

      // 5) 合约到期列表（已过期，未续约/未终止）
      const expired = contracts.filter(c => {
        const days = ContractModule.calculateDaysRemaining(c.endDate);
                            const statusText = ContractModule.getContractStatus(c).text;
                            return days < 0 && statusText !== '已续约' && statusText !== '已终止';
                        });
                        if (this.dashExpiredTbodyEl) {
                            this.dashExpiredTbodyEl.innerHTML = expired.length === 0
                            ? '<tr><td colspan="5" class="text-muted text-center">暂无数据</td></tr>'
                            : expired.map(c => {
              const stu = students.find(s => s.id === c.studentId);
                                const days = ContractModule.calculateDaysRemaining(c.endDate);
                                return `<tr>
                                    <td>${stu ? stu.name : '未知'}</td>
                                    <td>${stu ? stu.grade : '未知'}</td>
                                    <td>${c.serviceType}</td>
                                    <td>${c.startDate}</td>
                                    <td>${c.endDate}</td>
                                    <td style="color:#c62828;font-weight:600;">${days}</td>
                                </tr>`;
                                }).join('');
      }

      // 6) 7天内即将到期列表（生效中）
      const expiringSoon = contracts.filter(c => {
  const days = ContractModule.calculateDaysRemaining(c.endDate);
                            const statusText = ContractModule.getContractStatus(c).text;
                            return days >= 0 && days <= 7 && statusText !== '已续约' && statusText !== '已终止';
                        }).sort((a,b) => ContractModule.calculateDaysRemaining(a.endDate) - ContractModule.calculateDaysRemaining(b.endDate));
                        
                        if (this.dashExpiringTbodyEl) {
                            this.dashExpiringTbodyEl.innerHTML = expiringSoon.length === 0
                            ? '<tr><td colspan="6" class="text-muted text-center">暂无数据</td></tr>'
                            : expiringSoon.map(c => {
              const stu = students.find(s => s.id === c.studentId);
                                const days = ContractModule.calculateDaysRemaining(c.endDate);
                                return `<tr>
                                    <td>${stu ? stu.name : '未知'}</td>
                                    <td>${stu ? stu.grade : '未知'}</td>
                                    <td>${c.serviceType}</td>
                                    <td>${c.startDate}</td>
                                    <td>${c.endDate}</td>
                                    <td>${days}</td>
                                </tr>`;
                                }).join('');
      }

    } catch (e) {
      console.error('Dashboard render failed:', e);
      UIModule.showToast('看板渲染失败', 'error','center');
    }
  }
};

            
            // =================================================================================
            // SYSTEM MODULE (*** REFACTORED FOR MULTI-TABLE ARCHITECTURE ***)
            // =================================================================================
           const SystemModule = {
    // === 1. 修改后的 clearSupabaseTable (请求返回 count) ===
    async clearSupabaseTable(supabase, tableName) {
        let query;
        
        if (tableName === 'holiday_config') {
            // 删除特定行，并要求返回被删除的数据数量
            query = supabase.from(tableName).delete({ count: 'exact' }).eq('id', 1);
        } else {
            // 删除所有行，并要求返回被删除的数据数量
            query = supabase.from(tableName).delete({ count: 'exact' }).neq('id', 'non-existent-id');
        }

        const { data, error, count } = await query;
        
        // 将 count 传递出去
        return { data, error, count };
    },

    async handleReset() {
        const password = document.getElementById('resetPassword').value;
        if (password === 'peiyoutuoguan') {
            try {
                UIModule.showToast('开始重置系统...', 'info', 'center');

                // 调用 resetCloudData，如果失败会抛出错误
                const cloudResetSuccess = await SystemModule.resetCloudData(); 

                if (cloudResetSuccess) {
                    // 确认云端清空成功后，才清空本地数据
                    await IDBModule.clearState(IDBModule.STORES.APP);
                    await IDBModule.clearState(IDBModule.STORES.CONTRACT);

                    channel.postMessage({ type: 'SYSTEM_RESET' });
                    bootstrap.Modal.getInstance(document.getElementById('resetSystemModal')).hide();
                    UIModule.showToast('系统重置成功！本地和云端数据已全部清除。', 'success', 'center');
                    setTimeout(() => window.location.reload(), 2000);
                } 
                // 注意：如果 resetCloudData 失败并抛出错误，代码将跳过这里，直接进入 catch 块。
                else {
                    // 如果 resetCloudData 返回 false (如 Supabase未初始化)，则显示此信息
                    UIModule.showToast('云端重置失败，请检查网络连接或 Supabase 初始化状态后重试！', 'error', 'center');
                }

            } catch (error) {
                // 捕获到 resetCloudData 抛出的外键约束错误
                console.error('An error occurred during reset:', error);
                // 这里的 error.message 将包含具体的 Supabase 错误信息 (例如：...violates foreign key constraint...)
                UIModule.showToast(`重置失败，原因：${error.message || '未知错误'}`, 'error', 'center');
            }
        } else {
            // === (精确修复) ===
            UIModule.showToast('密码错误！', 'error', 'center');
            // 1. 找到那个独立的输入框
            const passwordInput = document.getElementById('resetPassword');
            if (passwordInput) {
                // 2. 清空
                passwordInput.value = '';
                // 3. 重新置入光标
                passwordInput.focus();
            }
            // === (修复结束) ===
        }
    },

    // === 2. 核心修复：重构 resetCloudData 为顺序删除，并调整删除顺序 ===
    // === 2. 修改后的 resetCloudData (增加权限校验逻辑) ===
    async resetCloudData() {
        if (!SupabaseSyncModule.isInitialized || !SupabaseSyncModule.supabase) {
            console.error("Supabase sync module not initialized.");
            return false;
        }

        // 获取当前用户
        const { data: { user } } = await SupabaseSyncModule.supabase.auth.getUser();
        const currentUserEmail = user?.email;

        // 【前端双重保险】虽然 SQL 做了限制，但前端也可以先拦一道，提升体验
        if (currentUserEmail !== 'zjq29@126.com') {
            throw new Error(`当前用户 (${currentUserEmail}) 无权执行系统重置操作。`);
        }

        try {
            // 顺序：子表 -> 父表
            const tableNames = [
                'homeworks',
                'contracts',
                'subjects',
                'students',
                'holiday_config'
            ];

            let totalDeleted = 0;

            for (const tableName of tableNames) {
                const { error, count } = await SystemModule.clearSupabaseTable(SupabaseSyncModule.supabase, tableName);

                if (error) {
                    throw new Error(`Hard delete failed on "${tableName}": ${error.message}`);
                }
                
                // 累加删除数量
                if (count !== null) totalDeleted += count;
            }

            console.log(`Cloud data reset successfully. Total rows deleted: ${totalDeleted}`);
            return true;
        } catch (error) {
            console.error('Cloud reset failed:', error);
            throw error;
        }
    }
};

// Event listener for the reset button
// 20251130注释，防止重置系统出现2次绑定和通知document.getElementById('confirmResetBtn').addEventListener('click', () => { // 以});结尾
// 20251130 (修复：改用 .onclick 赋值，防止因脚本重复加载导致侦听器被重复绑定)
document.getElementById('confirmResetBtn').onclick = () => {
    SystemModule.handleReset();
}

// =================================================================================
// LOGIN MODULE (Updated for Switch User & User Display)
// =================================================================================
const LoginModule = {
    init() {
        // 1. 获取 DOM 元素
        const loginOverlay = document.getElementById('loginOverlay');
        const loginBtn = document.getElementById('loginBtn');
        const loginError = document.getElementById('loginError');
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const appHeader = document.querySelector('.platform-header');
        const appContainer = document.querySelector('.page-container');
        
        // (新) 获取显示用户名的元素和切换按钮
        const currentUserDisplay = document.getElementById('currentUserDisplay');
        const switchUserBtn = document.getElementById('switchUserBtn');

        // 2. 初始化 Supabase
        SupabaseSyncModule.init();

        // (新) 定义：更新 UI 显示用户名的函数
        const updateCurrentUserDisplay = (email) => {
        App.currentUserEmail = email; // 1. 更新全局状态
        const isSuper = App.isSuperAdmin();

            //更新用户名和角色标签
            if (currentUserDisplay) {
            const roleHtml = isSuper 
            ? `<span class="user-role-badge admin">管理员</span>`
            : `<span class="user-role-badge teacher">操作员</span>`;
        
            currentUserDisplay.innerHTML = `当前用户: ${email} ${roleHtml}`;
            }
        };

        // 3. 定义：登录成功后的处理逻辑
        const handleSuccessfulLogin = async (userEmail) => {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.removeItem('systemWasReset');
            
            // (新) 更新 Header 上的用户名
            updateCurrentUserDisplay(userEmail);

            loginOverlay.style.opacity = '0';
            setTimeout(async () => {
                loginOverlay.style.display = 'none';
                appHeader.style.visibility = 'visible';
                appContainer.style.visibility = 'visible';

                // 初始化 App
                await initializeApp();
            }, 500);
        };

        // 4. 定义：尝试登录逻辑
        const attemptLogin = async () => {
            const email = emailInput.value;
            const password = passwordInput.value;

            if (!email || !password) {
                loginError.textContent = '请输入邮箱和密码。';
                loginError.classList.remove('d-none');
                return;
            }

            loginBtn.disabled = true;
            loginBtn.textContent = '登录中...';
            loginError.classList.add('d-none');

            try {
                const { data, error } = await SupabaseSyncModule.supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error) throw error;

                console.log('Supabase 登录成功:', data.user.email);
                // 传入邮箱用于显示
                handleSuccessfulLogin(data.user.email);

            } catch (error) {
                console.error('Supabase 登录失败:', error.message);
                loginError.textContent = '邮箱或密码输入错误，请重试。';
                loginError.classList.remove('d-none');
                passwordInput.focus();
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = '登 录';
            }
        };

        // 5. (新) 定义：切换用户（注销）逻辑
        const handleLogout = async () => {
    // 提示语保持不变
    UIModule.showConfirmation('切换用户', '确定要退出当前账号并切换用户吗？<br><span class="text-muted small">本地数据将保留，仅切换当前操作身份。</span>', async () => {
        
        // === 核心修改：立即锁定屏幕 ===
        // 这会弹出一个全屏的半透明遮罩，阻挡任何点击操作
        UIModule.showScreenLock('正在退出系统...');

        try {
            // (可选) 为了视觉流畅，我们可以让 Toast 和锁屏同时存在，或者只保留锁屏
            // UIModule.showToast('正在切换用户...', 'info'); 
            
            // 1. Supabase 注销
            // 在此期间，界面已被锁定，用户无法操作
            await SupabaseSyncModule.supabase.auth.signOut();
            
            // 2. 清除本地会话标记
            sessionStorage.removeItem('isLoggedIn');
            
            // 3. 刷新页面
            window.location.reload();
            
        } catch (e) {
            console.error('Logout failed:', e);
            // 如果出错（极少情况），虽然界面锁定了，但刷新页面是最终兜底方案
            // 所以这里其实不需要 unlock，直接 reload 也是安全的。
            // 但为了逻辑严谨，如果不想刷新，可以移除 d-none
            window.location.reload(); 
        }
    });
};

        // 6. 检查现有会话
        const checkSessionAndInitialize = async () => {
            const { data: { session } } = await SupabaseSyncModule.supabase.auth.getSession();

            if (session) {
                console.log('自动登录:', session.user.email);
                handleSuccessfulLogin(session.user.email);
            } else {
                console.log('显示登录界面。');
                sessionStorage.removeItem('isLoggedIn');
                
                // 绑定登录输入事件
                loginBtn.addEventListener('click', attemptLogin);
                emailInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });
                passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });
                emailInput.focus();
            }
        };

        // 7. (新) 绑定切换用户按钮事件
        if (switchUserBtn) {
            switchUserBtn.addEventListener('click', handleLogout);
        }

        // 8. 启动检查
        checkSessionAndInitialize();
    }
};

            // =================================================================================
            // APP INITIALIZATION
            // =================================================================================
            // (请将这个完整的函数粘贴到 LoginModule.init(); 这一行的 *上面*)
// (这是修复后的代码)
const initializeApp = async () => {
    // 1. 负责加载 IndexedDB 数据到 App.state
    await App.init(); 

    // 2. 负责加载 IndexedDB 数据到 ContractModule.state
    await ContractModule.init(); // (修复：添加 await)

    // 3. 正常初始化所有其他模块
    StudentModule.init();
    SubjectModule.init();
    ProgressModule.init();
    LargeScreenModule.init();
    HomeworkModule.init();
    DashboardModule.init();

    // 4. (关键) 在所有数据加载完毕后，设置标志
    SupabaseSyncModule.isAppLoaded = true;

    // 5. (关键) 手动触发一次网络状态处理
    // 这将安全地运行 handleNetworkOnline()
    // 因为 isAppLoaded 标志现在为 true
    // 这会触发我们刚才持久化的 pendingSync（待上传）
    if (navigator.onLine) {
        SupabaseSyncModule.handleNetworkOnline();
    } else {
        SupabaseSyncModule.handleNetworkOffline();
    }

    // 6. (保留) 登录成功 1 秒后，执行“有条件的恢复”
    // 因为 isAppLoaded=true 且 App.state 已满，
    // syncFromCloudIfNeeded() 会安全跳过，不会覆盖数据。
    setTimeout(() => {
        SupabaseSyncModule.syncFromCloudIfNeeded();
    }, 1000);
};

            LoginModule.init();

            // =================================================================================
    // (V2 修复) 模态框关闭时的 a11y 焦点警告
    //
    // 监听 'hide.bs.modal' (开始关闭时)，而不是 'hidden.bs.modal' (关闭后)
    // 这样能抢在 'aria-hidden' 属性被设置前，主动让模态框内的元素失焦。
    // =================================================================================
    try {
        const allModals = document.querySelectorAll('.modal');
        
        allModals.forEach((modalEl) => {
            
            // (关键修改) 使用 'hide.bs.modal' 事件
            modalEl.addEventListener('hide.bs.modal', () => {
                
                // (关键修改) 检查当前拥有焦点的元素是否在这个即将关闭的模态框 *内部*
                if (document.activeElement && modalEl.contains(document.activeElement)) {
                    
                    // 如果是，立刻让它失焦 (blur)
                    // 焦点会安全地退回到 <body>
                    document.activeElement.blur();
                }
            });
        });
    } catch (e) {
        console.warn("Modal focus-fix initialization failed:", e);
    }
    // === 修复结束 ===
    
    // === (修复：针对“重置系统”弹窗的独立修复) ===
try {
    const resetModal = document.getElementById('resetSystemModal');
    const resetInput = document.getElementById('resetPassword');

    if (resetModal && resetInput) {

        // 1. 修复：弹出时自动聚焦，并清空上次的值
        resetModal.addEventListener('shown.bs.modal', () => {
            resetInput.value = ''; // 确保打开时是空的
            resetInput.focus();  // 置入光标
        });

        // 2. 修复：关闭时（点X或取消）清空
        resetModal.addEventListener('hidden.bs.modal', () => {
            resetInput.value = ''; // 确保关闭后是空的
        });
    }
} catch (e) {
    console.warn("Reset System 弹窗的独立修复逻辑失败:", e);
}
// === (修复结束) ===

        });