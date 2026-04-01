import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    private users = new Map<number, User>();
    private nextId = 1;

    async create(createUserDto: CreateUserDto): Promise<User> {
        const newUser: User = { 
            id: this.nextId++,
            username: createUserDto.username,
            email: createUserDto.email,
            createdAt: new Date()
        };
        this.users.set(newUser.id, newUser);
        return newUser;
    }

    async findAll(): Promise<User[]> {
        return Array.from(this.users.values());
    }

    async findOne(id: string): Promise<User | undefined> {
        return this.users.get(parseInt(id));
    }

    updateUser(id: number, updateData: any) {
        const user = this.users.get(id);
        if (user) {
            const updated = { ...user, ...updateData };
            this.users.set(id, updated);
            return updated;
        }
        return null;
    }

    deleteUser(id: number) {
        const user = this.users.get(id);
        if (user) {
            this.users.delete(id);
            return user;
        }
        return null;
    }
}