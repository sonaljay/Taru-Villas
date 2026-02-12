'use client'

import { useAuth } from '@/components/providers/auth-provider'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Building2, Mail, Shield, User } from 'lucide-react'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatRole(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function SettingsPage() {
  const { profile } = useAuth()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar size="lg" className="size-16 rounded-xl">
              {profile.avatarUrl && (
                <AvatarImage src={profile.avatarUrl} alt={profile.fullName} />
              )}
              <AvatarFallback className="rounded-xl text-lg">
                {getInitials(profile.fullName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{profile.fullName}</h3>
              <Badge variant="secondary">{formatRole(profile.role)}</Badge>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <User className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Full Name</p>
                <p className="text-sm font-medium">{profile.fullName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Mail className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{profile.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Shield className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="text-sm font-medium">{formatRole(profile.role)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Properties Card */}
      <Card>
        <CardHeader>
          <CardTitle>Assigned Properties</CardTitle>
          <CardDescription>
            Properties you have access to in the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Building2 className="mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {profile.role === 'admin'
                  ? 'As an admin, you have access to all properties.'
                  : 'No properties have been assigned to you yet.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {profile.assignments.map((assignment) => (
                <div
                  key={assignment.assignmentId}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Building2 className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {assignment.propertyName}
                      </p>
                      <Badge
                        variant="outline"
                        className="mt-0.5 text-[10px] font-normal"
                      >
                        {assignment.propertyCode}
                      </Badge>
                    </div>
                  </div>
                  <Badge
                    variant={assignment.propertyIsActive ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {assignment.propertyIsActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance Card (Placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">
                Switch between light and dark mode.
              </p>
            </div>
            <Badge variant="outline">Coming Soon</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
