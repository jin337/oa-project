import { Form, InputNumber, Radio, Select, Space } from '@arco-design/web-react'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

const WITHDRAW_WINDOW_UNIT_OPTIONS = [
    { label: '分钟', value: 'minute', max: 60 },
    { label: '小时', value: 'hour', max: 24 },
    { label: '天', value: 'day', max: 7 },
]

const VALID_WITHDRAW_UNITS = new Set(WITHDRAW_WINDOW_UNIT_OPTIONS.map((item) => item.value))
const MAX_WITHDRAW_BY_UNIT = Object.fromEntries(WITHDRAW_WINDOW_UNIT_OPTIONS.map((item) => [item.value, item.max]))
const DEFAULT_WITHDRAW_WINDOW = Object.freeze({ value: 30, unit: 'minute' })
const DEFAULT_RECALL_WINDOW = Object.freeze({ value: 30, unit: 'minute' })

// 待办超时提醒：单独一套单位上限（时限通常按天计，不受撤回窗口的 7 天上限约束）
const TASK_TIMEOUT_UNIT_OPTIONS = [
    { label: '分钟', value: 'minute', max: 1440 },
    { label: '小时', value: 'hour', max: 720 },
    { label: '天', value: 'day', max: 365 },
]
const VALID_TASK_TIMEOUT_UNITS = new Set(TASK_TIMEOUT_UNIT_OPTIONS.map((item) => item.value))
const MAX_TASK_TIMEOUT_BY_UNIT = Object.fromEntries(TASK_TIMEOUT_UNIT_OPTIONS.map((item) => [item.value, item.max]))
// 默认关闭（0 表示不提醒），由用户显式配置后才对之后提交的实例生效
const DEFAULT_TASK_TIMEOUT = Object.freeze({ value: 0, unit: 'hour' })
// 待办到期预警：距截止还剩该时长时提前提醒一次，0 表示不预警
const DEFAULT_TASK_ADVANCE = Object.freeze({ value: 0, unit: 'hour' })
const UNIT_MINUTES = { minute: 1, hour: 60, day: 1440 }
const windowDurationMinutes = (w) => (UNIT_MINUTES[w.unit] || 1) * (Number(w.value) || 0)

const parseJsonValue = (raw) => {
    if (!raw || typeof raw !== 'string') return raw || null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

const normalizeWindow = (incoming = {}, fallback) => {
    const unit = VALID_WITHDRAW_UNITS.has(incoming.unit) ? incoming.unit : fallback.unit
    const rawValue = Number(incoming.value)
    const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : fallback.value
    return {
        value: Math.min(value, MAX_WITHDRAW_BY_UNIT[unit]),
        unit,
    }
}

const normalizeWithdrawWindow = (incoming = {}) => normalizeWindow(incoming, DEFAULT_WITHDRAW_WINDOW)
const normalizeRecallWindow = (incoming = {}) => normalizeWindow(incoming, DEFAULT_RECALL_WINDOW)

const normalizeTaskDuration = (incoming = {}, fallback) => {
    const unit = VALID_TASK_TIMEOUT_UNITS.has(incoming.unit) ? incoming.unit : fallback.unit
    const rawValue = Number(incoming.value)
    const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 0
    return {
        value: Math.min(value, MAX_TASK_TIMEOUT_BY_UNIT[unit]),
        unit,
    }
}

// 待办超时：incoming 缺失或值为 0 均视为「不提醒」，保留 0 而不是回退到默认值
const normalizeTaskTimeout = (incoming = {}) => normalizeTaskDuration(incoming, DEFAULT_TASK_TIMEOUT)
// 到期预警：与超时提醒同口径，0 表示不预警
const normalizeTaskAdvance = (incoming = {}) => normalizeTaskDuration(incoming, DEFAULT_TASK_ADVANCE)

const DEFAULT_APPROVAL_MODE = 'sequential'
const APPROVAL_MODE_OPTIONS = ['pre', 'post']
const normalizeApprovalMode = (incoming) => (APPROVAL_MODE_OPTIONS.includes(incoming) ? incoming : DEFAULT_APPROVAL_MODE)

/**
 * 其他设置组件（嵌入 DesignManage 页面级 Tabs）：
 * 承载审批模式、提交撤回时间窗与审核撤回时间窗；数据独立写入 approval_other_json。
 */
const OtherManage = forwardRef(function OtherManage({ app = null }, ref) {
    const [approvalMode, setApprovalMode] = useState(DEFAULT_APPROVAL_MODE)
    const [withdrawWindow, setWithdrawWindow] = useState(DEFAULT_WITHDRAW_WINDOW)
    const [recallWindow, setRecallWindow] = useState(DEFAULT_RECALL_WINDOW)
    const [taskTimeout, setTaskTimeout] = useState(DEFAULT_TASK_TIMEOUT)
    const [taskAdvance, setTaskAdvance] = useState(DEFAULT_TASK_ADVANCE)

    useEffect(() => {
        const otherConfig = parseJsonValue(app?.approval_other_json)
        const legacyLayout = parseJsonValue(app?.form_layout_json)
        const configured = otherConfig?.withdrawWindow || legacyLayout?.formConfig?.withdrawWindow
        setApprovalMode(normalizeApprovalMode(otherConfig?.approvalMode))
        setWithdrawWindow(normalizeWithdrawWindow(configured))
        setRecallWindow(normalizeRecallWindow(otherConfig?.recallWindow))
        setTaskTimeout(normalizeTaskTimeout(otherConfig?.taskTimeout))
        setTaskAdvance(normalizeTaskAdvance(otherConfig?.taskAdvance))
    }, [app])

    useImperativeHandle(
        ref,
        () => ({
            getApprovalOther: () => ({ approvalMode, withdrawWindow, recallWindow, taskTimeout, taskAdvance }),
        }),
        [approvalMode, withdrawWindow, recallWindow, taskTimeout, taskAdvance],
    )

    const handleValueChange = (value) => {
        const next = Number(value)
        setWithdrawWindow((prev) => {
            const max = MAX_WITHDRAW_BY_UNIT[prev.unit]
            const clamped = Number.isFinite(next) && next > 0 ? Math.min(Math.floor(next), max) : prev.value
            return { ...prev, value: clamped }
        })
    }

    const handleUnitChange = (unit) => {
        setWithdrawWindow((prev) => ({
            ...prev,
            unit,
            value: Math.min(prev.value, MAX_WITHDRAW_BY_UNIT[unit]),
        }))
    }

    const handleRecallValueChange = (value) => {
        const next = Number(value)
        setRecallWindow((prev) => {
            const max = MAX_WITHDRAW_BY_UNIT[prev.unit]
            const clamped = Number.isFinite(next) && next > 0 ? Math.min(Math.floor(next), max) : prev.value
            return { ...prev, value: clamped }
        })
    }

    const handleRecallUnitChange = (unit) => {
        setRecallWindow((prev) => ({
            ...prev,
            unit,
            value: Math.min(prev.value, MAX_WITHDRAW_BY_UNIT[unit]),
        }))
    }

    // 待办超时允许填 0（关闭），因此下限为 0 而不是 1
    const handleTaskTimeoutValueChange = (value) => {
        const next = Number(value)
        setTaskTimeout((prev) => {
            const max = MAX_TASK_TIMEOUT_BY_UNIT[prev.unit]
            const clamped = Number.isFinite(next) && next >= 0 ? Math.min(Math.floor(next), max) : prev.value
            return { ...prev, value: clamped }
        })
    }

    const handleTaskTimeoutUnitChange = (unit) => {
        setTaskTimeout((prev) => ({
            ...prev,
            unit,
            value: Math.min(prev.value, MAX_TASK_TIMEOUT_BY_UNIT[unit]),
        }))
    }

    // 到期预警与超时提醒同口径：允许 0（关闭），单位上限复用超时提醒的配置
    const handleTaskAdvanceValueChange = (value) => {
        const next = Number(value)
        setTaskAdvance((prev) => {
            const max = MAX_TASK_TIMEOUT_BY_UNIT[prev.unit]
            const clamped = Number.isFinite(next) && next >= 0 ? Math.min(Math.floor(next), max) : prev.value
            return { ...prev, value: clamped }
        })
    }

    const handleTaskAdvanceUnitChange = (unit) => {
        setTaskAdvance((prev) => ({
            ...prev,
            unit,
            value: Math.min(prev.value, MAX_TASK_TIMEOUT_BY_UNIT[unit]),
        }))
    }

    // 预警必须早于超时才有意义：提前量不短于超时时长时后端会按未配置处理，这里提前给出提示
    const advanceWarning = (() => {
        if (taskAdvance.value <= 0) return ''
        if (taskTimeout.value <= 0) return '超时提醒为 0 时，到期预警不会生效'
        if (windowDurationMinutes(taskAdvance) >= windowDurationMinutes(taskTimeout)) {
            return '预警提前量需小于超时提醒时长，否则不会生效'
        }
        return ''
    })()

    return (
        <div className="p-3">
            <Form layout="horizontal" labelCol = {{ style: { flexBasis: 140 } }} wrapperCol = {{ style: { flexBasis: `calc(100% - ${140}px)` } }}>
                <Form.Item
                    label="审批模式"
                    extra="同一审批人出现在多个审批节点时：顺序审批=每个节点各审一次；前置审批=只在首次出现的节点审批，后续节点自动通过；后置审批=只在最后出现的节点审批，更早节点自动通过。自动通过均时间线留痕、退回后不重复审批。默认顺序审批。"
                >
                    <Radio.Group value={approvalMode} onChange={setApprovalMode}>
                        <Radio value="sequential">顺序审批</Radio>
                        <Radio value="pre">前置审批</Radio>
                        <Radio value="post">后置审批</Radio>
                    </Radio.Group>
                </Form.Item>
                <Form.Item
                    label="提交撤回时间"
                    extra="无审核记录的申请，自首次正式提交时间起算；撤回后重新提交不重置计时。超过该时间后，「我的发起」不再显示撤回按钮；历史未配置时默认 30 分钟。"
                >
                    <Space>
                        <InputNumber
                            min={1}
                            max={MAX_WITHDRAW_BY_UNIT[withdrawWindow.unit]}
                            precision={0}
                            value={withdrawWindow.value}
                            onChange={handleValueChange}
                            style={{ width: 120 }}
                        />
                        <Select
                            value={withdrawWindow.unit}
                            options={WITHDRAW_WINDOW_UNIT_OPTIONS}
                            onChange={handleUnitChange}
                            style={{ width: 100 }}
                        />
                    </Space>
                </Form.Item>
                <Form.Item
                    label="审核撤回时间"
                    extra="审批人可撤回自己的操作（通过/退回/转交/加签），自本人操作时间起算；必须是该操作之后无其他审批动作。或签节点「通过」不可撤回，「退回」仍可撤回；历史未配置时默认 30 分钟。"
                >
                    <Space>
                        <InputNumber
                            min={1}
                            max={MAX_WITHDRAW_BY_UNIT[recallWindow.unit]}
                            precision={0}
                            value={recallWindow.value}
                            onChange={handleRecallValueChange}
                            style={{ width: 120 }}
                        />
                        <Select
                            value={recallWindow.unit}
                            options={WITHDRAW_WINDOW_UNIT_OPTIONS}
                            onChange={handleRecallUnitChange}
                            style={{ width: 100 }}
                        />
                    </Space>
                </Form.Item>
                <Form.Item
                    label="待办超时提醒"
                    extra="待办任务自创建起超过该时长仍未处理时，给当前审批人发送站内超时提醒（每 24 小时最多续催 3 次）；仅提醒，不改变审批流转。0 表示不提醒。按提交时的配置快照生效，修改只影响之后提交的申请。"
                >
                    <Space>
                        <InputNumber
                            min={0}
                            max={MAX_TASK_TIMEOUT_BY_UNIT[taskTimeout.unit]}
                            precision={0}
                            value={taskTimeout.value}
                            onChange={handleTaskTimeoutValueChange}
                            style={{ width: 120 }}
                        />
                        <Select
                            value={taskTimeout.unit}
                            options={TASK_TIMEOUT_UNIT_OPTIONS}
                            onChange={handleTaskTimeoutUnitChange}
                            style={{ width: 100 }}
                        />
                    </Space>
                </Form.Item>
                <Form.Item
                    label="待办到期预警"
                    extra={
                        <>
                            距超时还剩该时长时，提前给当前审批人发一次站内预警（同一任务仅一次）；0 表示不预警。需小于上面的「待办超时提醒」时长。
                            {advanceWarning && <div className="text-red-500">{advanceWarning}</div>}
                        </>
                    }
                >
                    <Space>
                        <InputNumber
                            min={0}
                            max={MAX_TASK_TIMEOUT_BY_UNIT[taskAdvance.unit]}
                            precision={0}
                            value={taskAdvance.value}
                            onChange={handleTaskAdvanceValueChange}
                            style={{ width: 120 }}
                        />
                        <Select
                            value={taskAdvance.unit}
                            options={TASK_TIMEOUT_UNIT_OPTIONS}
                            onChange={handleTaskAdvanceUnitChange}
                            style={{ width: 100 }}
                        />
                    </Space>
                </Form.Item>
            </Form>
        </div>
    )
})

export default OtherManage
