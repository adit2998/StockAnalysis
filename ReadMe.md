Project for stock analysis


Command to start/stop mongodb locally

`brew services start mongodb/brew/mongodb-community`

`brew services stop mongodb/brew/mongodb-community`


- Added backend for processing

- To process a company, run python company_processing_pipeline.py 
In company_processing_pipeline.py, add the ticker in the parameter that you want to process


- To build the node docker container:
 `docker build -t stock-backend .`

- To run the node docker container:
 `docker run -d -p 5001:5001 --name stock-backend-container --env-file .env stock-backend`


- To start all the containers, run the compose file (make sure the minikube container is not running - minikube stop):
 `docker-compose up --build`

- To clean up and rebuild:
 `docker-compose down`
 `docker-compose up --build`

- Two flows possible: one with local development and one with containers
 The .env.local file should take care of the local. 
 For node to pick up from local mongo, run the brew services start command. 
 Run this command now to start node locally:
 `NODE_ENV=local node server.js`
 Run the front end as usual:
 `npm start`

 But if running node from a container, stop the brew services since mongo port 27017 will cause issues. 

 For running the python file processing function from local, run this:
 `ENV=local python company_processing_pipeline.py`

 Else if docker containers are up, simply run this:
 `python company_processing_pipeline.py`


- Minikube

Minikube is a tool that is simulating the Kubernetes architecture.
It runs as a container on Docker ()

To Point your terminal at minikube's Docker
Run this:
`eval $(minikube docker-env)`

What does this do? It sets some environment variables in your terminal session that redirect all docker commands to talk to minikube's Docker daemon instead of your Mac's. It's temporary — it only affects the current terminal window.

To confirm it worked:
`docker images`
You'll see a list of images that looks unfamiliar — these are Kubernetes' own internal images inside minikube, not your Mac's images. That confirms you're now talking to minikube's Docker.

To save something in minikube's docker, create a port forwarding connection. Open a dedicated terminal tab and run:
`kubectl port-forward <pod-name> 27017:27017`

Leave this running — don't Ctrl+C it. While it's running, your Python program can connect to MongoDB

To see mongo running inside the Kubernetes minikube pod:
`kubectl exec -it <pod-name> -- mongosh -u admin -p secret --authenticationDatabase admin`
Get pod name by running
`kubectl get pods`



For node deployment and service in minkube, run these first:
`kubectl apply -f k8s/server-secret.yaml`
`kubectl apply -f k8s/server-deployment.yaml`
`kubectl apply -f k8s/server-service.yaml`

Create a port connection, run this command and leave the terminal running.
`kubectl port-forward <pod-name> 5001:5001`


- Why do we even need port forwarding? 
When Kubernetes runs your Pods inside minikube, they're on a private internal network that only exists inside the cluster. Think of it like a private office network that has no connection to the outside world.

Pods inside the cluster can talk to each other freely — that's why your backend can reach MongoDB using just mongo:27017. They're on the same private network.
But you, sitting on your Mac, have no route into that private network. So you can't just open http://localhost:5001 and expect to hit the server Pod — there's no path there.

kubectl port-forward punches a temporary hole through that boundary — it creates a tunnel from a port on your Mac directly into a specific Pod:

It works by:

kubectl talks to the Kubernetes API server inside minikube
The API server opens a connection to the target Pod
kubectl sits in the middle forwarding traffic between your Mac and the Pod
That's why the terminal tab has to stay open — kubectl is actively proxying traffic the whole time

Port-forward is a direct line to a specific Pod — it bypasses all the normal Kubernetes networking. It's really just a debugging and development tool.
In a real production setup (and eventually in our setup too) you wouldn't use port-forward at all. Instead you'd use an Ingress — a proper gateway that sits at the edge of the cluster and routes external traffic in. 




- Apply everything for frontend
`kubectl apply -f k8s/frontend-secret.yaml`
`kubectl apply -f k8s/frontend-deployment.yaml`
`kubectl apply -f k8s/frontend-service.yaml`


Start port forwarding for frontend pod:
`kubectl port-forward <pod-name> 3000:3000`
(Also have backend port forwarding running)
The frontend Pod's only job is to serve the JavaScript files to your browser. Once your browser has those files, it runs them locally on your Mac. All the API calls your React code makes then originate directly from your Mac — which is why they need their own tunnel into the cluster.




To use the Kubernetes set up:

1. Start minikube
`minikube start --driver=docker`

2. — Point terminal at minikube's Docker and build images
`eval $(minikube docker-env)`
`docker compose build frontend server`

3. — Apply all Kubernetes manifests
kubectl apply -f k8s/mongo-pv.yaml
kubectl apply -f k8s/mongo-pvc.yaml
kubectl apply -f k8s/mongo-deployment.yaml
kubectl apply -f k8s/mongo-service.yaml
kubectl apply -f k8s/server-secret.yaml
kubectl apply -f k8s/server-deployment.yaml
kubectl apply -f k8s/server-service.yaml
kubectl apply -f k8s/frontend-secret.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml

4. — Wait for all Pods to be running
`kubectl get pods --watch`

5. — Open port-forwards (each in its own terminal tab)
Frontend
`kubectl port-forward <port-name> 3000:3000`

Backend
`kubectl port-forward <port-name> 5001:5001`

Leave the Mongo on to run the processing from python
`kubectl port-forward <port-name> 27017:27017`