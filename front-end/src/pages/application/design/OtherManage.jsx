import { Form, InputNumber, Select, Space } from '@arco-design/web-react'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

const WITHDRAW_WINDOW_UNIT_OPTIONS = [
    { label: '分钟', value: 'minute' },
    { label: '小时', value: 'hour' },
    { label: '天', value: 'day' },
]

const VALID_WITHDRAW_UNITS = new Set(WITHDRAW_WINDOW_UNIT_OPTIONS.map((item) => item.value))
const DEFAULT_WITHDRAW_WINDOW = Object.freeze({ value: 30, unit: 'minute' })

const parseJsonValue = (raw) => {
    if (!raw || typeof raw !== 'string') return raw || null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

const normalizeWithdrawWindow = (incoming = {}) => {
    const rawValue = Number(incoming.value)
    return {
        value: Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : DEFAULT_WITHDRAW_WINDOW.value,
        unit: VALID_WITHDRAW_UNITS.has(incoming.unit) ? incoming.unit : DEFAULT_WITHDRAW_WINDOW.unit,
    }
}

/**
 * 其他设置组件（嵌入 DesignManage 页面级 Tabs）：
 * 当前仅承载提交撤回时间窗；数据独立写入 approval_other_json。
 */
const OtherManage = forwardRef(function OtherManage({ app = null }, ref) {
    const [withdrawWindow, setWithdrawWindow] = useState(DEFAULT_WITHDRAW_WINDOW)

    useEffect(() => {
        const otherConfig = parseJsonValue(app?.approval_other_json)
        const legacyLayout = parseJsonValue(app?.form_layout_json)
        const configured = otherConfig?.withdrawWindow || legacyLayout?.formConfig?.withdrawWindow
        setWithdrawWindow(normalizeWithdrawWindow(configured))
    }, [app])

    useImperativeHandle(
        ref,
        () => ({
            getApprovalOther: () => ({ withdrawWindow }),
        }),
        [withdrawWindow],
    )

    const handleValueChange = (value) => {
        const next = Number(value)
        setWithdrawWindow((prev) => ({
            ...prev,
            value: Number.isFinite(next) && next > 0 ? Math.floor(next) : prev.value,
        }))
    }

    const handleUnitChange = (unit) => {
        setWithdrawWindow((prev) => ({ ...prev, unit }))
    }

    return (
        <div className="p-3">
            <Form layout="horizontal">
                <Form.Item
                    label="提交撤回时间"
                    extra="自首次正式提交时间起算；撤回后重新提交不重置计时。超过该时间后，「我的发起」不再显示撤回按钮；历史未配置时默认 30 分钟。"
                >
                    <Space>
                        <InputNumber
                            min={1}
                            max={9999}
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
            </Form>
        </div>
    )
})

export default OtherManage
