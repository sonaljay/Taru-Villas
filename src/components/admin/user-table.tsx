'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import {
  MoreHorizontal,
  Pencil,
  Power,
  ArrowUpDown,
  Search,
  UserPlus,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserInviteForm } from '@/components/admin/user-invite-form'
import { UserEditForm } from '@/components/admin/user-edit-form'
import type { ProfileWithAssignments } from '@/lib/db/queries/profiles'
import type { Property } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Role badge helper
// ---------------------------------------------------------------------------

const ROLE_CONFIG = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  property_manager: {
    label: 'Property Manager',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  staff: { label: 'Staff', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
} as const

function RoleBadge({ role }: { role: keyof typeof ROLE_CONFIG }) {
  const config = ROLE_CONFIG[role]
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(
  onEdit: (user: ProfileWithAssignments) => void,
  onToggleActive: (user: ProfileWithAssignments) => void
): ColumnDef<ProfileWithAssignments>[] {
  return [
    {
      accessorKey: 'fullName',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="size-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center gap-3">
            <Avatar size="default">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
              <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{user.fullName}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.email}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue || filterValue === 'all') return true
        return row.original.role === filterValue
      },
    },
    {
      id: 'properties',
      header: 'Properties',
      cell: ({ row }) => {
        const assignments = row.original.assignments
        if (row.original.role === 'admin') {
          return (
            <span className="text-xs text-muted-foreground italic">
              All properties
            </span>
          )
        }
        if (!assignments || assignments.length === 0) {
          return (
            <span className="text-xs text-muted-foreground italic">None</span>
          )
        }
        return (
          <div className="flex flex-wrap gap-1">
            {assignments.slice(0, 3).map((a) => (
              <Badge
                key={a.propertyId}
                variant="secondary"
                className="text-[11px]"
              >
                {a.propertyCode}
              </Badge>
            ))}
            {assignments.length > 3 && (
              <Badge variant="secondary" className="text-[11px]">
                +{assignments.length - 3}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => {
        const isActive = row.original.isActive
        return (
          <Badge
            variant={isActive ? 'default' : 'secondary'}
            className={
              isActive
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-zinc-100 text-zinc-500 border-zinc-200'
            }
          >
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const user = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(user)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={user.isActive ? 'destructive' : 'default'}
                onClick={() => onToggleActive(user)}
              >
                <Power className="size-4" />
                {user.isActive ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// UserTable Component
// ---------------------------------------------------------------------------

interface UserTableProps {
  users: ProfileWithAssignments[]
  properties: Property[]
}

export function UserTable({ users, properties }: UserTableProps) {
  const router = useRouter()

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [editUser, setEditUser] = useState<ProfileWithAssignments | null>(null)
  const [deactivateUser, setDeactivateUser] = useState<ProfileWithAssignments | null>(null)
  const [isToggling, setIsToggling] = useState(false)

  function handleEdit(user: ProfileWithAssignments) {
    setEditUser(user)
  }

  function handleToggleActiveClick(user: ProfileWithAssignments) {
    if (user.isActive) {
      setDeactivateUser(user)
    } else {
      toggleActive(user)
    }
  }

  async function toggleActive(user: ProfileWithAssignments) {
    setIsToggling(true)
    try {
      const endpoint = user.isActive
        ? `/api/users/${user.id}`
        : `/api/users/${user.id}`
      const method = user.isActive ? 'DELETE' : 'PATCH'
      const body = user.isActive ? undefined : JSON.stringify({ isActive: true })

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update user')
      }

      toast.success(user.isActive ? 'User deactivated' : 'User activated')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update user'
      )
    } finally {
      setIsToggling(false)
      setDeactivateUser(null)
    }
  }

  const columns = useMemo(
    () => createColumns(handleEdit, handleToggleActiveClick),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Apply role filter as a column filter
  const filteredData = useMemo(() => {
    if (roleFilter === 'all') return users
    return users.filter((u) => u.role === roleFilter)
  }, [users, roleFilter])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase()
      return (
        row.original.fullName.toLowerCase().includes(search) ||
        row.original.email.toLowerCase().includes(search)
      )
    },
    initialState: {
      pagination: { pageSize: 10 },
    },
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage team members and their access permissions
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Invite User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="property_manager">Property Manager</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      No users found
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {table.getRowModel().rows.length} of{' '}
            {table.getFilteredRowModel().rows.length} users
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation to a new team member.
            </DialogDescription>
          </DialogHeader>
          <UserInviteForm onSuccess={() => setInviteOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details and property assignments.
            </DialogDescription>
          </DialogHeader>
          {editUser && (
            <UserEditForm
              user={editUser}
              properties={properties}
              onSuccess={() => setEditUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate Alert Dialog */}
      <AlertDialog
        open={!!deactivateUser}
        onOpenChange={(open) => !open && setDeactivateUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate{' '}
              <span className="font-medium text-foreground">
                {deactivateUser?.fullName}
              </span>
              ? They will lose access to the management portal. You can
              reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deactivateUser && toggleActive(deactivateUser)}
              disabled={isToggling}
            >
              {isToggling ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
