import {
  Avatar,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Message,
  Radio,
  Tabs,
  Tag,
} from '@arco-design/web-react'
import { useEffect, useState } from 'react'
import * as userApi from '../api/user'
import { useAuth } from '../store/auth-context'

const FormItem = Form.Item
const TabPane = Tabs.TabPane

export default function Profile() {
  const { user, refreshProfile } = useAuth()

  // 基础信息表单
  const [infoForm] = Form.useForm()
  const [infoSaving, setInfoSaving] = useState(false)

  // 安全设置（修改密码）表单
  const [pwdForm] = Form.useForm()
  const [pwdSaving, setPwdSaving] = useState(false)

  // 用户资料加载后回填基础信息与详细档案
  useEffect(() => {
    if (user) {
      const profile = user.profile || {}
      infoForm.setFieldsValue({
        username: user.username,
        email: user.email || '',
        phone: user.phone || '',
        nickname: profile.nickname || '',
        gender: profile.gender ?? 0,
        birthday: profile.birthday || '',
        address: profile.address || '',
        join_date: profile.join_date || '',
        emergency_contact: profile.emergency_contact || '',
      })
    }
  }, [user, infoForm])

  // 保存基础信息 + 详细档案
  const handleSaveInfo = async () => {
    const values = await infoForm.validate()
    setInfoSaving(true)
    try {
      // 1. 更新基本信息（邮箱 / 手机号）
      await userApi.updateUser(user.id, { email: values.email, phone: values.phone })
      // 2. 更新详细档案（UserProfile）
      await userApi.updateUserProfile(user.id, {
        nickname: values.nickname,
        gender: values.gender,
        birthday: values.birthday || '',
        address: values.address,
        join_date: values.join_date || '',
        emergency_contact: values.emergency_contact,
      })
      await refreshProfile()
      Message.success('个人信息更新成功')
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setInfoSaving(false)
    }
  }

  // 保存新密码
  const handleSavePassword = async () => {
    const values = await pwdForm.validate()
    setPwdSaving(true)
    try {
      await userApi.updateUserPassword(user.id, {
        old_password: values.old_password,
        new_password: values.new_password,
      })
      Message.success('密码修改成功')
      pwdForm.resetFields()
    } catch (e) {
      // 错误已在请求层提示
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 顶部：用户信息展示卡片 */}
      <Card>
        <div className="flex items-center gap-12">
          {/* 左侧：大头像 */}
          <Avatar size={100} style={{ backgroundColor: '#165dff', fontSize: 28 }}>
            {user?.username?.charAt(0)?.toUpperCase()}
          </Avatar>

          {/* 右侧：详细资料 */}
          <div className="flex-1 max-w-300">
            <Descriptions
              column={2}
              labelStyle={{ textAlign: 'right', paddingRight: 20 }}
              data={[
                {
                  label: '用户名',
                  value: user?.username || '-',
                },
                {
                  label: '状态',
                  value:
                    user?.status === 1 ? (
                      <Tag color="green">启用</Tag>
                    ) : (
                      <Tag color="red">停用</Tag>
                    ),
                },
                {
                  label: '手机号',
                  value: user?.phone || '-',
                },
                {
                  label: '邮箱',
                  value: user?.email || '-',
                },
                {
                  label: '注册时间',
                  value: user?.created_at?.slice(0, 19).replace('T', ' ') || '-',
                },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* 底部：设置表单区 */}
      <Card title="账号设置">
        <Tabs type="rounded" defaultActiveTab="info">
          {/* 基础信息 */}
          <TabPane key="info" title="基础信息">
            <Form form={infoForm} layout="horizontal" autoComplete="off" className="max-w-md">
              <FormItem label="用户名" field="username">
                <Input disabled />
              </FormItem>
              <FormItem
                label="邮箱"
                field="email"
                rules={[{ type: 'email', message: '邮箱格式不正确' }]}
              >
                <Input placeholder="请输入邮箱" allowClear />
              </FormItem>
              <FormItem label="手机号" field="phone">
                <Input placeholder="请输入手机号" allowClear />
              </FormItem>
              <FormItem
                label="姓名"
                field="nickname"
                rules={[{ maxLength: 64, message: '姓名不能超过 64 个字符' }]}
              >
                <Input placeholder="请输入姓名" allowClear />
              </FormItem>
              <FormItem label="性别" field="gender">
                <Radio.Group>
                  <Radio value={1}>男</Radio>
                  <Radio value={2}>女</Radio>
                </Radio.Group>
              </FormItem>
              <FormItem label="出生日期" field="birthday">
                <DatePicker placeholder="请选择出生日期" allowClear className="w-full" />
              </FormItem>
              <FormItem
                label="联系地址"
                field="address"
                rules={[{ maxLength: 255, message: '联系地址不能超过 255 个字符' }]}
              >
                <Input placeholder="请输入联系地址" allowClear />
              </FormItem>
              <FormItem label="入职日期" field="join_date">
                <DatePicker placeholder="请选择入职日期" allowClear className="w-full" />
              </FormItem>
              <FormItem
                label="紧急联系人"
                field="emergency_contact"
                rules={[{ maxLength: 64, message: '紧急联系人不能超过 64 个字符' }]}
              >
                <Input placeholder="请输入紧急联系人" allowClear />
              </FormItem>
              <FormItem label=" ">
                <Button type="primary" loading={infoSaving} onClick={handleSaveInfo}>
                  保存修改
                </Button>
              </FormItem>
            </Form>
          </TabPane>

          {/* 安全设置 */}
          <TabPane key="security" title="安全设置">
            <Form form={pwdForm} layout="vertical" autoComplete="off" className="max-w-md">
              <FormItem
                label="旧密码"
                field="old_password"
                rules={[
                  { required: true, message: '请输入旧密码' },
                  { minLength: 6, message: '密码至少 6 个字符' },
                ]}
              >
                <Input.Password placeholder="请输入旧密码" />
              </FormItem>
              <FormItem
                label="新密码"
                field="new_password"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { minLength: 6, message: '密码至少 6 个字符' },
                ]}
              >
                <Input.Password placeholder="请输入新密码" />
              </FormItem>
              <FormItem
                label="确认新密码"
                field="confirm_password"
                rules={[
                  { required: true, message: '请再次输入新密码' },
                  {
                    validator: (value, cb) => {
                      if (value !== pwdForm.getFieldValue('new_password')) {
                        cb('两次输入的密码不一致')
                      } else {
                        cb()
                      }
                    },
                  },
                ]}
              >
                <Input.Password
                  placeholder="请再次输入新密码"
                  onChange={() => {
                    // 新密码变化时重新校验确认密码
                    if (pwdForm.getFieldValue('confirm_password')) {
                      pwdForm.validate(['confirm_password']).catch(() => {})
                    }
                  }}
                />
              </FormItem>
              <FormItem>
                <Button type="primary" loading={pwdSaving} onClick={handleSavePassword}>
                  修改密码
                </Button>
              </FormItem>
            </Form>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  )
}
