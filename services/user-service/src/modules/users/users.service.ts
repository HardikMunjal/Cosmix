import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    private users: User[] = [];

    async create(createUserDto: CreateUserDto): Promise<User> {
        const newUser: User = { 
            id: this.users.length + 1, 
            username: createUserDto.username,
            email: createUserDto.email,
            createdAt: new Date()
        };
        this.users.push(newUser);
        return newUser;
    }

    async findAll(): Promise<User[]> {
        return this.users;
    }

    async findOne(id: string): Promise<User | undefined> {
        return this.users.find(user => user.id === parseInt(id));
    }

    updateUser(id: number, updateData: any) {
        const userIndex = this.users.findIndex(user => user.id === id);
        if (userIndex > -1) {
            this.users[userIndex] = { ...this.users[userIndex], ...updateData };
            return this.users[userIndex];
        }
        return null;
    }

    deleteUser(id: number) {
        const userIndex = this.users.findIndex(user => user.id === id);
        if (userIndex > -1) {
            const deletedUser = this.users[userIndex];
            this.users.splice(userIndex, 1);
            return deletedUser;
        }
        return null;
    }
}