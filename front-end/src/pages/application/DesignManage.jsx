import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Message,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
} from '@arco-design/web-react'
import { IconSwap } from '@arco-design/web-react/icon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as applicationApi from 'src/api/application'
import * as deptApi from 'src/api/dept'
import { listExamineGroups } from 'src/api/examineGroup'
import { fetchAll } from 'src/api/fetchAll'
import * as roleApi from 'src/api/role'
import ExamineManage from 'src/pages/application/design/ExamineManage'
import LayoutManage from 'src/pages/application/design/LayoutManage.jsx'
import { transformDeptTree, transformRoleList } from 'src/pages/application/examine/flowModel'

const TabPane = Tabs.TabPane

const VERSION_STATUS = {
  0: { label: '待生效', color: 'orange' },
  1: { label: '已生效', color: 'green' },
  2: { label: '已失效', color: 'gray' },
  3: { label: '设计中', color: 'blue' },
}

const parseJson = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'object') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

const formatTime = (v) => {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const toJsDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v.toDate === 'function') return v.toDate()
  return new Date(v)
}

const disablePastDate = (current) => {
  const d = toJsDate(current)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

const disablePastTime = (current) => {
  const empty = { disabledHours: () => [], disabledMinutes: () => [], disabledSeconds: () => [] }
  const d = toJsDate(current)
  if (!d) return empty
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (!isToday) return empty
  return {
    disabledHours: () => Array.from({ length: now.getHours() }, (_, i) => i),
    disabledMinutes: (h) =>
      h === now.getHours() ? Array.from({ length: now.getMinutes() }, (_, i) => i) : [],
    disabledSeconds: (h, m) =>
      h === now.getHours() && m === now.getMinutes()
        ? Array.from({ length: now.getSeconds() }, (_, i) => i)
        : [],
  }
}

/**
 * 表单设计统一入口（钉钉式模型）：
 * - 每个应用只有一条「设计中」版本，保存直接写它；
 * - 发布 = 把设计中版本转成 scheduled/active，并从旧 active 克隆新的设计中行；
 * - 历史版本只读，可预览查看但不能编辑。
 */
export default function DesignManage() {
  const { id } = useParams()
  const [app, setApp] = useState(null)
  const [elements, setElements] = useState([])
  const [orgTree, setOrgTree] = useState([])
  const [roleList, setRoleList] = useState([])
  const [examineGroups, setExamineGroups] = useState([])
  const [saving, setSaving] = useState(false)
  const [publishVisible, setPublishVisible] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishForm, setPublishForm] = useState({ remark: '', mode: 'now', effectiveAt: null })
  const [versionVisible, setVersionVisible] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [versionList, setVersionList] = useState([])
  const [editingVersion, setEditingVersion] = useState(null)
  const [editingEffectiveAt, setEditingEffectiveAt] = useState(null)
  const [editingRemark, setEditingRemark] = useState('')
  const [previewVersion, setPreviewVersion] = useState(null)
  // 草稿态重挂载计数：保存到草稿等动作后递增，强制设计组件用最新草稿数据重新初始化
  const [draftTick, setDraftTick] = useState(0)
  // 布局组件左右侧栏折叠状态：上提到父级持有，切版本 / 保存到草稿重挂载时保持；整页刷新后恢复默认展开
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const toggleLeftCollapsed = () => setLeftCollapsed((v) => !v)
  const toggleRightCollapsed = () => setRightCollapsed((v) => !v)
  const [draftVersion, setDraftVersion] = useState(null)
  const layoutRef = useRef(null)
  const examineRef = useRef(null)

  const loadElements = useCallback(async () => {
    const res = await fetchAll((p) => applicationApi.listApplicationElements(id, p))
    setElements(res.data?.list || [])
  }, [id])

  const reloadApp = useCallback(async () => {
    const res = await applicationApi.getApplication(id)
    // 返回结构：{ application, in_design_version }
    setApp(res.data?.application || res.data)
    setDraftVersion(res.data?.in_design_version || null)
  }, [id])

  useEffect(() => {
    if (!id) return
    reloadApp().catch(() => {})
    loadElements().catch(() => {})
  }, [id, reloadApp, loadElements])

  useEffect(() => {
    Promise.all([
      deptApi.getDeptUsersTree({ status: 1 }),
      fetchAll(roleApi.listRoles, { status: 1 }),
      fetchAll(listExamineGroups, { status: 1 }),
    ])
      .then(([deptRes, roleRes, groupRes]) => {
        setOrgTree(transformDeptTree(deptRes.data?.list || deptRes.data || []))
        setRoleList(transformRoleList(roleRes.data?.list || roleRes.data || []))
        setExamineGroups(groupRes.data?.list || groupRes.data || [])
      })
      .catch(() => {})
  }, [])

  const collectPayload = useCallback(() => {
    const layoutPayload = layoutRef.current?.getLayoutPayload?.() || {}
    const liveNodes = examineRef.current?.getNodes?.()
    let savedFlow = app?.approval_flow_json
    if (typeof savedFlow === 'string') {
      try {
        savedFlow = savedFlow ? JSON.parse(savedFlow) : []
      } catch {
        savedFlow = []
      }
    }
    let flow = Array.isArray(liveNodes) && liveNodes.length ? liveNodes : savedFlow || []
    // 旧版表单设置中的提交前后事件迁移到发起人节点；迁移后从表单配置中移除
    const formConfig = layoutPayload?.form_layout_json?.formConfig
    const legacyBefore = formConfig?.onSubmitBefore
    const legacyAfter = formConfig?.onSubmitAfter
    if (legacyBefore || legacyAfter) {
      flow = flow.map((node) =>
        node && node.type === 1
          ? {
              ...node,
              onSubmitBefore: node.onSubmitBefore ?? legacyBefore,
              onSubmitAfter: node.onSubmitAfter ?? legacyAfter,
            }
          : node,
      )
      delete formConfig.onSubmitBefore
      delete formConfig.onSubmitAfter
    }
    return {
      ...layoutPayload,
      approval_flow_json: flow,
    }
  }, [app])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = collectPayload()
      // 后端自动把 json 写到「设计中」版本行
      await applicationApi.updateApplication(id, payload)
      Message.success('保存成功')
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  // 预览历史版本态：「保存到草稿」把当前编辑器（含预览态下的修改）汇总写入设计中草稿，随后退出预览回到草稿编辑态
  const handleSavePreviewToDraft = async () => {
    if (!previewVersion) return
    setSaving(true)
    try {
      const payload = collectPayload()
      await applicationApi.updateApplication(id, payload)
      Message.success('已保存到草稿')
      setPreviewVersion(null)
      await reloadApp()
      // 强制设计组件按最新草稿数据重挂载，避免沿用旧的画布内存态
      setDraftTick((t) => t + 1)
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const openPublish = async () => {
    setPublishVisible(true)
    // 默认立即生效、版本说明为空，不沿用当前 active 版本的生效方式与说明
    setPublishForm({ remark: '', mode: 'now', effectiveAt: null })
    try {
      const res = await applicationApi.listApplicationVersions(id)
      const list = (res.data || []).filter((v) => v.status !== 3)
      setVersionList(list)
    } catch (e) {
      // 用默认空
    }
  }

  const handlePublishOk = async () => {
    setPublishing(true)
    try {
      const payload = collectPayload()
      // 先把编辑器里的最新内容保存到设计中行
      await applicationApi.updateApplication(id, payload)
      const reqPayload = { remark: publishForm.remark || '' }
      if (publishForm.mode === 'timer' && publishForm.effectiveAt) {
        reqPayload.effective_at = new Date(publishForm.effectiveAt).toISOString()
      }
      await applicationApi.publishApplicationVersion(id, reqPayload)
      Message.success(publishForm.mode === 'now' ? '已发布并立即生效' : '已发布，到时间自动生效')
      setPublishVisible(false)
      await reloadApp()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setPublishing(false)
    }
  }

  const loadVersions = useCallback(async () => {
    setVersionLoading(true)
    try {
      const res = await applicationApi.listApplicationVersions(id)
      // 不展示当前「设计中」行
      setVersionList((res.data || []).filter((v) => v.status !== 3))
    } catch (e) {
      setVersionList([])
    } finally {
      setVersionLoading(false)
    }
  }, [id])

  const openVersions = () => {
    setVersionVisible(true)
    loadVersions().catch(() => {})
  }

  const startEditVersion = (record) => {
    setEditingVersion(record)
    setEditingEffectiveAt(record.effective_at)
    setEditingRemark(record.remark || '')
  }

  const saveEditVersion = async () => {
    if (!editingVersion || !editingEffectiveAt) return
    try {
      await applicationApi.updateApplicationVersionEffectiveAt(id, editingVersion.id, {
        effective_at: new Date(editingEffectiveAt).toISOString(),
        remark: editingRemark,
      })
      Message.success('已更新')
      setEditingVersion(null)
      await loadVersions()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const deleteVersion = async (record) => {
    try {
      await applicationApi.deleteApplicationVersion(id, record.id)
      Message.success('已删除')
      await loadVersions()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const switchPreview = (record) => {
    setPreviewVersion(record)
    setVersionVisible(false)
    setEditingVersion(null)
  }

  const effectiveApp = useMemo(
    () =>
      previewVersion
        ? {
            ...(app || {}),
            form_layout_json: parseJson(previewVersion.form_layout_json),
            detail_layout_json: parseJson(previewVersion.detail_layout_json),
            approval_flow_json: parseJson(previewVersion.approval_flow_json),
          }
        : app,
    [app, previewVersion],
  )

  return (
    <Card
      className="h-full overflow-y-hidden"
      bodyStyle={{ padding: 0, height: 'calc(100% - 46px)' }}
      title={
        <Space>
          <span>{app?.name ? `表单设计 - ${app.name}` : '表单设计'}</span>
          {app?.current_version_no && (
            <Button shape="round" size="mini" type="primary" onClick={openVersions}>
              生效版本：{app.current_version_no}
              <IconSwap />
            </Button>
          )}
        </Space>
      }
      extra={
        previewVersion ? (
          <Button type="primary" loading={saving} onClick={handleSavePreviewToDraft}>
            保存到草稿
          </Button>
        ) : (
          <Space>
            <Button loading={saving} onClick={handleSave}>
              保存
            </Button>
            <Button type="primary" onClick={openPublish}>
              发布
            </Button>
          </Space>
        )
      }
    >
      <Tabs
        type="line"
        justify
        destroyOnHide={false}
        className="[&_.arco-tabs-content]:p-0!"
        extra={
          <div className="px-4">
            {previewVersion ? (
              <Button size="mini" status="danger" onClick={() => setPreviewVersion(null)}>
                退出预览（{previewVersion.version_no}）
              </Button>
            ) : (
              <Tag color="red">草稿：{draftVersion?.version_no || '-'}</Tag>
            )}
          </div>
        }
      >
        <TabPane key="layout" title="表单设置布局">
          <LayoutManage
            key={`layout-${previewVersion?.id || `draft-${draftTick}`}`}
            ref={layoutRef}
            app={effectiveApp}
            elements={elements}
            onRefreshElements={loadElements}
            leftCollapsed={leftCollapsed}
            rightCollapsed={rightCollapsed}
            onToggleLeftCollapsed={toggleLeftCollapsed}
            onToggleRightCollapsed={toggleRightCollapsed}
          />
        </TabPane>
        <TabPane key="examine" title="审批流程" className="overflow-y-auto p-3">
          <ExamineManage
            key={`examine-${previewVersion?.id || `draft-${draftTick}`}`}
            ref={examineRef}
            app={effectiveApp}
            formFields={elements}
            orgTree={orgTree}
            roleList={roleList}
            examineGroups={examineGroups}
          />
        </TabPane>
      </Tabs>

      <Modal
        title="发布新版本"
        visible={publishVisible}
        onCancel={() => setPublishVisible(false)}
        onOk={handlePublishOk}
        confirmLoading={publishing}
        okText="发布"
      >
        <Form layout="vertical">
          <Form.Item label="生效方式">
            <Radio.Group
              value={publishForm.mode}
              onChange={(v) => setPublishForm((f) => ({ ...f, mode: v }))}
            >
              <Radio value="now">立即生效</Radio>
              <Radio value="timer">定时生效</Radio>
            </Radio.Group>
          </Form.Item>
          {publishForm.mode === 'timer' && (
            <Form.Item label="生效时间">
              <DatePicker
                showTime
                style={{ width: '100%' }}
                getPopupContainer={(node) => document.body}
                disabledDate={disablePastDate}
                disabledTime={disablePastTime}
                value={publishForm.effectiveAt}
                onChange={(v) => setPublishForm((f) => ({ ...f, effectiveAt: v }))}
              />
            </Form.Item>
          )}
        </Form>
        <Form.Item layout="vertical" label="版本说明">
          <Input
            placeholder="例如：新增差旅子表"
            value={publishForm.remark}
            onChange={(v) => setPublishForm((f) => ({ ...f, remark: v }))}
          />
        </Form.Item>
      </Modal>

      <Modal
        title="版本列表"
        visible={versionVisible}
        footer={null}
        autoFocus={false}
        onCancel={() => {
          setVersionVisible(false)
          setEditingVersion(null)
        }}
        unmountOnExit
        className="w-240! max-w-[90vw] [&_.arco-modal-content]:max-h-[60vh] [&_.arco-modal-content]:overflow-y-auto"
      >
        <Table
          rowKey="id"
          loading={versionLoading}
          data={versionList}
          pagination={false}
          columns={[
            { title: '版本号', dataIndex: 'version_no', width: 80, align: 'center' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (s) => {
                const cfg = VERSION_STATUS[s] || { label: String(s), color: 'gray' }
                return <Tag color={cfg.color}>{cfg.label}</Tag>
              },
            },
            {
              title: '生效时间',
              dataIndex: 'effective_at',
              width: 200,
              render: (v, record) =>
                editingVersion?.id === record.id ? (
                  <DatePicker
                    size="mini"
                    showTime
                    style={{ width: '100%' }}
                    getPopupContainer={(node) => document.body}
                    disabledDate={disablePastDate}
                    disabledTime={disablePastTime}
                    value={editingEffectiveAt}
                    onChange={(val) => setEditingEffectiveAt(val)}
                  />
                ) : (
                  formatTime(v)
                ),
            },
            { title: '失效时间', dataIndex: 'expired_at', width: 160, render: formatTime },
            {
              title: '版本说明',
              dataIndex: 'remark',
              render: (v, record) =>
                editingVersion?.id === record.id ? (
                  <Input
                    size="mini"
                    style={{ width: '100%' }}
                    value={editingRemark}
                    onChange={(val) => setEditingRemark(val)}
                  />
                ) : (
                  v || '-'
                ),
            },
            {
              title: '操作',
              width: 190,
              render: (_, record) => {
                if (editingVersion?.id === record.id) {
                  return (
                    <Space size="small">
                      <Button size="mini" type="primary" onClick={saveEditVersion}>
                        保存
                      </Button>
                      <Button size="mini" onClick={() => setEditingVersion(null)}>
                        取消
                      </Button>
                    </Space>
                  )
                }
                return (
                  <Space size="small">
                    <Button size="mini" type="primary" onClick={() => switchPreview(record)}>
                      {previewVersion?.id === record.id ? '查看中' : '预览'}
                    </Button>
                    {record.status === 0 && (
                      <Space size="small">
                        <Button size="mini" onClick={() => startEditVersion(record)}>
                          编辑
                        </Button>
                        <Popconfirm
                          title="确认删除该待生效版本？"
                          position="left"
                          onOk={() => deleteVersion(record)}
                        >
                          <Button size="mini" status="danger">
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    )}
                  </Space>
                )
              },
            },
          ]}
        />
      </Modal>
    </Card>
  )
}
