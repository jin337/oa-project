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

    useEffect(() => {
        const otherConfig = parseJsonValue(app?.approval_other_json)
        const legacyLayout = parseJsonValue(app?.form_layout_json)
        const configured = otherConfig?.withdrawWindow || legacyLayout?.formConfig?.withdrawWindow
        setApprovalMode(normalizeApprovalMode(otherConfig?.approvalMode))
        setWithdrawWindow(normalizeWithdrawWindow(configured))
        setRecallWindow(normalizeRecallWindow(otherConfig?.recallWindow))
    }, [app])

    useImperativeHandle(
        ref,
        () => ({
            getApprovalOther: () => ({ approvalMode, withdrawWindow, recallWindow }),
        }),
        [approvalMode, withdrawWindow, recallWindow],
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
            </Form>
        </div>
    )
})

export default OtherManage
