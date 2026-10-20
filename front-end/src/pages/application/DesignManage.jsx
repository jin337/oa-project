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
  Typography,
} from '@arco-design/web-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

/**
 * 表单设计统一入口：
 * - 外层 Card 标题「流程名 - 表单设计」，右上角「保存 / 发布」；
 * - 保存：一次合并 form_layout_json / detail_layout_json / approval_flow_json 草稿；
 * - 发布：把当前草稿快照成新版本，支持立即生效或定时生效。
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
  const [previewVersion, setPreviewVersion] = useState(null)
  const layoutRef = useRef(null)
  const examineRef = useRef(null)

  // 拉取表单元素列表（子组件共用）
  const loadElements = useCallback(async () => {
    const res = await fetchAll((p) => applicationApi.listApplicationElements(id, p))
    setElements(res.data?.list || [])
  }, [id])

  const reloadApp = useCallback(async () => {
    const res = await applicationApi.getApplication(id)
    setApp(res.data)
  }, [id])

  // 流程详情 + 表单元素
  useEffect(() => {
    if (!id) return
    reloadApp().catch(() => {})
    loadElements().catch(() => {})
  }, [id, reloadApp, loadElements])

  // 组织架构 / 角色 / 审核人员组（审批选择器共用，全局只需一次）
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

  // 收集当前编辑器中的三个 json
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
    const approvalFlowJson =
      Array.isArray(liveNodes) && liveNodes.length ? liveNodes : savedFlow || []
    return {
      ...layoutPayload,
      approval_flow_json: approvalFlowJson,
    }
  }, [app])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = collectPayload()
      if (previewVersion) {
        // 预览版本时，保存直接写回该版本快照，同时本地同步 previewVersion 避免切 tab 后用旧快照重挂载
        await applicationApi.updateApplicationVersion(id, previewVersion.id, payload)
        setPreviewVersion((prev) => ({
          ...prev,
          form_layout_json: payload.form_layout_json,
          detail_layout_json: payload.detail_layout_json,
          approval_flow_json: payload.approval_flow_json,
        }))
      } else {
        await applicationApi.updateApplication(id, payload)
      }
      Message.success('保存成功')
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setSaving(false)
    }
  }

  const openPublish = async () => {
    setPublishVisible(true)
    // 拉一次版本列表，用于预填当前 active 版本的说明/生效时间
    let list = versionList
    try {
      const res = await applicationApi.listApplicationVersions(id)
      list = res.data || []
      setVersionList(list)
    } catch (e) {
      // 忽略，用已有 list
    }
    const src = previewVersion || list.find((v) => v.status === 1)
    setPublishForm({
      remark: src?.remark || '',
      mode: src?.effective_at ? 'timer' : 'now',
      effectiveAt: src?.effective_at ? new Date(src.effective_at) : null,
    })
  }

  const handlePublishOk = async () => {
    setPublishing(true)
    try {
      const payload = collectPayload()
      const reqPayload = { remark: publishForm.remark || '' }
      if (publishForm.mode === 'timer' && publishForm.effectiveAt) {
        reqPayload.effective_at = new Date(publishForm.effectiveAt).toISOString()
      }
      if (previewVersion) {
        // 基于已有版本：先更新 json 快照，再设置生效时间/备注
        await applicationApi.updateApplicationVersion(id, previewVersion.id, payload)
        const republished = await applicationApi.republishApplicationVersion(id, previewVersion.id, reqPayload)
        setPreviewVersion(republished.data)
      } else {
        // 新发布：先落草稿，再生成新版本
        await applicationApi.updateApplication(id, payload)
        const created = await applicationApi.publishApplicationVersion(id, reqPayload)
        setPreviewVersion(created.data)
      }
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
      setVersionList(res.data || [])
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
  }

  const saveEditVersion = async () => {
    if (!editingVersion || !editingEffectiveAt) return
    try {
      await applicationApi.updateApplicationVersionEffectiveAt(
        id,
        editingVersion.id,
        new Date(editingEffectiveAt).toISOString(),
      )
      Message.success('生效时间已更新')
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
      if (previewVersion?.id === record.id) setPreviewVersion(null)
      await loadVersions()
    } catch (e) {
      // 错误已在请求层提示
    }
  }

  const formatTime = (v) => {
    if (!v) return '-'
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const VERSION_STATUS = {
    0: { label: '待生效', color: 'orange' },
    1: { label: '已生效', color: 'green' },
    2: { label: '已失效', color: 'gray' },
  }

  // 把版本快照中的 json 字段（可能是字符串或对象）解析成对象，供子组件渲染
  const parseJsonField = (v) => {
    if (v == null || v === '') return null
    if (typeof v === 'object') return v
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }

  // 预览某版本：把表单布局 / 详情布局 / 审批流替换成该版本快照
  const switchPreview = (record) => {
    setPreviewVersion(record)
    setVersionVisible(false)
    setEditingVersion(null)
  }

  // 当前传给子组件的 app：预览模式下用快照覆盖三个 json 字段
  const effectiveApp = previewVersion
    ? {
        ...(app || {}),
        form_layout_json: parseJsonField(previewVersion.form_layout_json),
        detail_layout_json: parseJsonField(previewVersion.detail_layout_json),
        approval_flow_json: parseJsonField(previewVersion.approval_flow_json),
      }
    : app

  // 禁止选择当前时间之前的日期/时间
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

  return (
    <Card
      className="h-full overflow-y-hidden"
      bodyStyle={{ padding: 0, height: 'calc(100% - 46px)' }}
      title={
        <Space>
          <span>{app?.name ? `表单设计 - ${app.name}` : '表单设计'}</span>
          {app?.current_version_no && (
            <Tag>
              当前版本：
              <Typography.Text type="primary" className="cursor-pointer" onClick={openVersions}>
                {app.current_version_no}
              </Typography.Text>
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {previewVersion && (
            <Button size="small" onClick={() => setPreviewVersion(null)}>
              退出预览（当前：{previewVersion.version_no}）
            </Button>
          )}
          <Button loading={saving} onClick={handleSave}>
            保存
          </Button>
          <Button type="primary" onClick={openPublish}>
            发布
          </Button>
        </Space>
      }
    >
      <Tabs type="line" justify destroyOnHide={false} className="[&_.arco-tabs-content]:p-0!">
        <TabPane key="layout" title="表单设置布局">
          <LayoutManage
            key={`layout-${previewVersion?.id || 'draft'}`}
            ref={layoutRef}
            app={effectiveApp}
            elements={elements}
            onRefreshElements={loadElements}
          />
        </TabPane>
        <TabPane key="examine" title="审批流程" className="overflow-y-auto p-3">
          <ExamineManage
            key={`examine-${previewVersion?.id || 'draft'}`}
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
            { title: '版本说明', dataIndex: 'remark', render: (v) => v || '-' },
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
                      {previewVersion?.id === record.id ? '查看中' : '切换'}
                    </Button>
                    {record.status === 0 && (
                      <Space size="small">
                        <Button size="mini" onClick={() => startEditVersion(record)}>
                          编辑
                        </Button>
                        <Popconfirm title="确认删除该待生效版本？" onOk={() => deleteVersion(record)}>
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
