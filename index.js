const express = require('express');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');


// connect to database
const client = new MongoClient(process.env.DB_URL, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


async function bootstrap() {
    try {
        await client.connect();
        console.log('Connected to database');

        const userCollection = client.db('yoga-school').collection('users');
        const classCollection = client.db('yoga-school').collection('classes');
        const userClassCollection = client.db('yoga-school').collection('user-classes');

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            // find the user in db if needed. With the user obj



            const userExist = await userCollection.findOne({ email: user.email });


            const token = jwt.sign({
                email: user.email,
                role: userExist?.role || 'student'
            }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            // console.log(userExist)
            res.send({ token, role: userExist?.role || 'student' })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        // get top 6 classes by no. of students enrolled
        app.get('/top-classes', async (req, res) => {
            // const result = await classCollection.aggregate([
            //     {
            //         $lookup: {
            //             from: "user-classes", // Replace with the actual name of the class collection
            //             localField: "_id",
            //             foreignField: "class._id",
            //             as: "students",

            //         }
            //     },
            //     {
            //         $addFields: {
            //             studentCount: { $size: "$students" },
            //             students: "$students.user",

            //         }
            //     },
            //     {
            //         $project: {
            //             _id: 0,
            //             name: 1,
            //             description: 1,
            //             instructorEmail: 1,
            //             studentCount: 1,
            //             students: 1
            //         }
            //     },
            //     {
            //         $sort: {
            //             studentCount: 1
            //         }
            //     },
            //     {
            //         $limit: 6
            //     }
            // ]).toArray();

            const topClasses = await classCollection.find().sort({ students: -1 }).limit(6).toArray();
            res.send(topClasses);
        })


        // users related apis
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'User already exists' });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })
        // user selected classes
        app.get('/selected-classes', verifyJWT, async (req, res) => {
            const email = req.decoded.email;
            const query = { user: email };
            const result = await userClassCollection.find(query).toArray();
            res.send(result);
        })

        // delete selected class
        app.delete('/delete-class/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userClassCollection.deleteOne(query);
            res.send(result);
        })

        // get all classes

        app.get('/classes', async (req, res) => {
            const result = await classCollection.find({
                status: 'approved'
            }).toArray();
            res.send(result);
        })

        // user Class request
        app.post('/select-class', verifyJWT, async (req, res) => {
            const classRequest = req.body;
            const result = await userClassCollection.insertOne(classRequest);
            res.send(result);
        });


        // instructors
        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' };
            const result = await userCollection.aggregate([
                {
                    $match: {
                        role: "instructor"
                    }
                },
                {
                    $lookup: {
                        from: "classes", // Replace with the actual name of the class collection
                        localField: "email",
                        foreignField: "instructorEmail",
                        as: "classes",

                    }
                },
                {
                    $addFields: {
                        classCount: { $size: "$classes" },
                        classes: "$classes.name",

                    }
                },
                {
                    $project: {
                        _id: 0,
                        name: 1,
                        email: 1,
                        role: 1,
                        classCount: 1,
                        classes: 1,
                        photoUrl: 1
                    }
                }
            ]).toArray();
            res.send(result);
        });

        // get popular instructors by no. of students enrolled in their classes
        app.get('/popular-instructors', async (req, res) => {
            const result = await userCollection.aggregate([
                {
                    $match: {
                        role: "instructor"
                    }
                },
                {
                    $lookup: {
                        from: "classes", // Replace with the actual name of the class collection
                        localField: "email",
                        foreignField: "instructorEmail",
                        as: "classes",

                    }
                },
                {
                    $addFields: {
                        classCount: { $size: "$classes" },
                        students: { $sum: "$classes.students" },
                        classes: "$classes.name",

                    }
                },

                {
                    $sort: {
                        students: -1
                    }
                },
                {
                    $limit: 6
                }
            ]).toArray();
            res.send(result);
        });
        app.post("/add-class", verifyJWT, async (req, res) => {
            const newClass = req.body;
            const result = await classCollection.insertOne(newClass);
            res.send(result);
        })

        app.get("/my-classes/", verifyJWT, async (req, res) => {
            // console.log(req.headers.authorization)

            const email = req.decoded.email;
            const query = { instructorEmail: email };
            const result = await classCollection.find(query).toArray();
            res.send(result);
        })


        // admin routes
        app.get("/all-classes",verifyJWT,verifyAdmin, async (req, res) => {
            const classes = await classCollection.find().toArray();
            res.send(classes)
        })
        //    update class status to approved

        app.patch("/update-class/:id",verifyJWT,verifyAdmin,  async (req, res) => {
            const id = req.params.id;
            const status = req.body.status;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: status
                }
            };
            const result = await classCollection.updateOne(query, updateDoc);
            res.send(result);
        })

        // add feedback to a class
        app.patch("/add-feedback/:id",verifyJWT,verifyAdmin,  async (req, res) => {
            const id = req.params.id;
            const feedback = req.body.feedback;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $push: {
                    feedback: feedback
                }
            };
            const result = await classCollection.updateOne(query, updateDoc);
            res.send(result);
        })

        // get all users
        app.get("/users",verifyJWT,verifyAdmin,  async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        // update user role
        app.patch("/update-user/:id",verifyJWT,verifyAdmin,  async (req, res) => {
            const id = req.params.id;
            const role = req.body.role;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: role
                }
            };
            const result = await userCollection.updateOne(query, updateDoc);
            res.send(result);
        })

    } catch (error) {
        console.log(error);
    }
}

// routes
app.get('/', (req, res) => {
    res.send('Server working properly');
});

bootstrap().catch(console.dir);


app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);

});